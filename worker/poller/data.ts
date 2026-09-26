import {
	classify,
	classifyDefault,
	firstMatchingRule,
	globToRegExp,
	validateRules
} from '../../src/lib/shared/classify';
import { validateDash } from '../../src/lib/shared/dashboard';
import { MENUS_VERSION, validateMenus } from '../../src/lib/shared/menus';
import { validateViews } from '../../src/lib/shared/views';
import {
	SNOOZE_EVENT_MAX_MS,
	snoozeEvent,
	snoozeOutcome,
	type SnoozeEvent
} from '../../src/lib/shared/snooze';
import type {
	AlertDTO,
	Counts,
	DashItem,
	DashKind,
	DashResponse,
	FeedFilter,
	Rule,
	Settings,
	ThreadDTO,
	Turn,
	View
} from '../../src/lib/shared/types';
import { userToken } from '../db';
import { markThreadDone, markThreadRead, muteThread } from '../github';
import { sendPush, vapidFromEnv } from '../webpush';
import { PollerDashboard } from './dashboard';
import {
	enrichmentFor,
	factsFromRow,
	subjectRefOf,
	toDTO,
	viewWhere,
	type ThreadWithFacts
} from './schema';
import { MIN, MUTED_BY_USER, type PollStatus } from './shared';

/** A request the Durable Object refused; the route answers with this status. */
export type Refusal = { error: string; status: 400 | 404 | 500 };

export type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';
const THREAD_ACTIONS = new Set<ThreadAction>([
	'done',
	'undone',
	'read',
	'unread',
	'snooze',
	'unsnooze',
	'mute',
	'unmute'
]);
// Mute makes 2 GitHub calls per thread; 20 × 2 stays under the Free plan's 50 subrequests.
const BULK_MAX = 20;
const MAX_DEVICES = 10;
const VIEWS = new Set<View>(['action', 'fyi', 'snoozed', 'done', 'muted', 'all', 'inbox']);
/** An open inbox records a visit (and brings the next poll forward) at most this often. */
const SEEN_EVERY = 5 * MIN;

type ItemRef = { id: string; updatedAt: string };
const marks = (n: number) => Array(n).fill('?').join(',');

/**
 * The user's data, for the API routes: the routes check the request's shape and answer; the
 * reads and writes happen here, next to the poller that also writes them.
 */
export abstract class PollerData extends PollerDashboard {
	// In the top class (worker/poller.ts), with the poll schedule.
	abstract touch(origin?: string): Promise<void>;
	abstract setHasPush(hasPush: boolean): Promise<void>;
	abstract status(): Promise<PollStatus>;

	/** For /api/me: your settings and the poll status, in one call. */
	async me(): Promise<{ settings: Settings; status: PollStatus }> {
		const [settings, status] = await Promise.all([this.settings(), this.status()]);
		return { settings, status };
	}

	/** Your GitHub login; the routes call only after the session check, so the account exists. */
	private async login(): Promise<string> {
		const user = await this.account();
		if (!user) throw new Error('Not signed in.');
		return user.login;
	}

	// --- Threads --------------------------------------------------------------------------

	counts(): Counts {
		const views = (['action', 'fyi', 'snoozed'] as const).map((v) => ({ v, ...viewWhere(v) }));
		const row = this.one<Counts>(
			`SELECT ${views.map(({ v, where }) => `SUM(CASE WHEN ${where} THEN 1 ELSE 0 END) AS ${v}`).join(', ')}
       FROM threads`,
			...views.flatMap((x) => x.args)
		);
		return { action: row?.action ?? 0, fyi: row?.fyi ?? 0, snoozed: row?.snoozed ?? 0 };
	}

	/**
	 * One inbox view. `ifNoneMatch` is the client's ETag: when nothing changed, answer without
	 * reading any threads. Opening the inbox also counts as a visit (see SEEN_EVERY).
	 */
	async listThreads(
		view: View,
		ifNoneMatch: string | null,
		origin: string
	): Promise<
		| Refusal
		| { notModified: true; etag: string }
		| { threads: ThreadDTO[]; counts: Counts; etag: string }
	> {
		if (!VIEWS.has(view)) return { error: 'Unknown view', status: 400 };
		const seen = (await this.ctx.storage.get<number>('lastActive')) ?? 0;
		if (Date.now() - seen >= SEEN_EVERY) this.ctx.waitUntil(this.touch(origin));
		const version = (await this.ctx.storage.get<number>('threadsVersion')) ?? 0;
		const etag = `W/"${version}.${view}"`;
		if (ifNoneMatch === etag) return { notModified: true, etag };
		const { where, args } = viewWhere(view);
		const order = view === 'snoozed' ? 'snoozed_until ASC' : 'gh_updated_at DESC';
		const rows = this.threads(`${where} ORDER BY ${order} LIMIT 300`, ...args);
		return { threads: rows.map(toDTO), counts: this.counts(), etag };
	}

	/** Apply one triage action to up to BULK_MAX threads, in one transaction. */
	async threadAction(
		ids: string[],
		action: ThreadAction,
		body: { until?: number; event?: SnoozeEvent }
	): Promise<Refusal | { ok: true; updated: number; counts: Counts }> {
		if (!THREAD_ACTIONS.has(action)) return { error: 'Unknown action', status: 400 };
		if (!ids.length || ids.length > BULK_MAX || ids.some((id) => typeof id !== 'string'))
			return { error: `Select 1 to ${BULK_MAX} threads.`, status: 400 };
		// "Until something happens": the time is only a deadline (default 7 days).
		const event = action === 'snooze' ? (body.event ?? null) : null;
		if (event && !snoozeEvent(event)) return { error: 'Unknown snooze condition.', status: 400 };
		const until =
			action === 'snooze' ? (body.until ?? (event ? Date.now() + SNOOZE_EVENT_MAX_MS : 0)) : 0;
		if (action === 'snooze' && until < Date.now())
			return { error: 'Snooze time must be in the future.', status: 400 };

		const me = await this.login();
		let threads = this.threads(`id IN (${marks(ids.length)})`, ...ids);
		if (!threads.length) return { error: 'Not found', status: 404 };
		// A state that is already true would wake the thread at once: refuse it with a clear reason.
		if (event) {
			const ev = snoozeEvent(event)!;
			const now = Date.now();
			// Only PRs and issues have the data these conditions read.
			const kindOf = (t: ThreadWithFacts) => enrichmentFor(t, me)?.kind ?? 'other';
			if (threads.some((t) => !ev.kinds.includes(kindOf(t) as 'pr' | 'issue')))
				return {
					error: `"${ev.label}" works only for ${ev.kinds.map((k) => (k === 'pr' ? 'pull requests' : 'issues')).join(' and ')}.`,
					status: 400
				};
			// Refuse what would end at once: the event already happened, or the PR is already closed.
			const endsNow = (t: ThreadWithFacts) => snoozeOutcome(ev.id, enrichmentFor(t, me), now, me);
			const already = threads.filter((t) => endsNow(t).wake);
			if (already.length === threads.length) {
				const o = endsNow(already[0]);
				return {
					error: `${o.wake ? o.reason : 'Done'} already. Pick another condition.`,
					status: 400
				};
			}
			threads = threads.filter((t) => !already.includes(t));
		}

		// Your own triage choice replaces an automatic one (see the inbox watcher).
		const NOT_AUTO = `resolved_at = NULL, resolved_note = NULL`;
		const set = (t: ThreadWithFacts, sql: string, ...args: (string | number | null)[]) =>
			this.run(`UPDATE threads SET ${sql} WHERE id = ?`, ...args, t.id);
		const settings = action === 'unmute' ? await this.settings() : null;
		const now = Date.now();
		this.transaction(() => {
			for (const t of threads)
				switch (action) {
					case 'done':
						set(
							t,
							`triage = 'done', snoozed_until = NULL, snooze_event = NULL, unread = 0, ${NOT_AUTO}`
						);
						break;
					case 'undone':
					case 'unsnooze':
						set(t, `triage = 'inbox', snoozed_until = NULL, snooze_event = NULL, ${NOT_AUTO}`);
						break;
					case 'read':
						set(t, `unread = 0, marked_unread_at = NULL`);
						break;
					// GitHub has no "mark as unread" API, so this one stays in Hush (and the read sync from
					// GitHub leaves it alone until you read the thread there again).
					case 'unread':
						set(t, `unread = 1, marked_unread_at = ?`, now);
						break;
					case 'snooze':
						set(
							t,
							`triage = 'snoozed', snoozed_until = ?, snooze_event = ?, snoozed_at = ?`,
							until,
							event,
							now
						);
						break;
					case 'mute':
						set(
							t,
							`category = 'muted', rule = ?, triage = 'done', snoozed_until = NULL, snooze_event = NULL`,
							MUTED_BY_USER
						);
						break;
					case 'unmute': {
						const cls = classify(factsFromRow(t, me), settings!);
						set(t, `category = ?, rule = ?, triage = 'inbox'`, cls.category, cls.rule ?? null);
						break;
					}
				}
		});
		await this.bumpVersion();

		// Mirror the change on GitHub in the background.
		if (action === 'done' || action === 'read' || action === 'mute') {
			const token = await userToken(this.env, (await this.account())!);
			const mirror = (id: string) =>
				action === 'done'
					? markThreadDone(token, id)
					: action === 'read'
						? markThreadRead(token, id)
						: muteThread(token, id).then(() => markThreadDone(token, id));
			this.ctx.waitUntil(Promise.allSettled(threads.map((t) => mirror(t.id))));
		}
		// Alerts for these threads on your other devices: replace them with a quiet note.
		const RESOLVED_NOTE: Partial<Record<ThreadAction, string>> = {
			done: 'Done',
			mute: 'Muted',
			snooze: 'Snoozed'
		};
		const note = RESOLVED_NOTE[action];
		if (note) this.ctx.waitUntil(this.notifyResolved(threads.map((t) => ({ id: t.id, note }))));
		return { ok: true, updated: threads.length, counts: this.counts() };
	}

	/** The threads for an Atom feed (see worker/feeds.ts), newest first. */
	feedThreads(filter: FeedFilter): ThreadWithFacts[] {
		const view =
			filter.view === 'action' || filter.view === 'fyi' ? `category = '${filter.view}'` : '1';
		const rows = this.threads(
			`category != 'muted' AND ${view} ORDER BY gh_updated_at DESC LIMIT 200`
		);
		const repoRe = filter.repo ? globToRegExp(filter.repo) : null;
		return rows.filter((r) => !repoRe || repoRe.test(r.repo)).slice(0, 50);
	}

	// --- Settings -------------------------------------------------------------------------

	/** Team slugs whose review requests count in the inbox (Settings → Inbox). */
	private async inboxTeamsFor(settings: Settings): Promise<string[]> {
		return settings.teamReviewsAreAction ? (await this.teams()).teams.map((t) => t.slug) : [];
	}

	/**
	 * Try rules on your stored threads without saving them: how many threads each rule would catch
	 * (first match wins), a few examples, and how many threads would change category compared with
	 * the saved rules.
	 */
	async previewRules(rules: unknown): Promise<
		| Refusal
		| {
				perRule: {
					matches: number;
					inInbox: number;
					examples: { title: string; repo: string; category: string }[];
				}[];
				moves: { action: number; fyi: number; muted: number };
				total: number;
		  }
	> {
		const err = validateRules(rules);
		if (err) return { error: err, status: 400 };
		const me = await this.login();
		const saved = await this.settings();
		const settings: Settings = { ...saved, rules: rules as Rule[] };
		const myTeams = await this.inboxTeamsFor(settings);
		const rows = this.threads('1');
		type Example = { title: string; repo: string; category: string };
		const perRule = settings.rules.map(() => ({
			matches: 0,
			inInbox: 0,
			open: [] as Example[],
			other: [] as Example[]
		}));
		const moves = { action: 0, fyi: 0, muted: 0 };
		for (const r of rows) {
			if (r.rule === MUTED_BY_USER) continue;
			const facts = factsFromRow(r, me, myTeams);
			const base = classifyDefault(facts, settings);
			const i = firstMatchingRule(facts, settings.rules, base);
			const categoryWith = (list: Rule[], k: number) =>
				k < 0 ? base.category : (list[k].then.category ?? base.category);
			const category = categoryWith(settings.rules, i);
			if (i >= 0) {
				const p = perRule[i];
				p.matches++;
				const open = r.triage === 'inbox' || r.triage === 'snoozed';
				if (open) p.inInbox++;
				const list = open ? p.open : p.other;
				if (list.length < 3) list.push({ title: r.title, repo: r.repo, category });
			}
			// The effect of your edits: compare with the rules you have saved now.
			const before = categoryWith(saved.rules, firstMatchingRule(facts, saved.rules, base));
			if (category !== before) moves[category as keyof typeof moves]++;
		}
		return {
			// Examples: threads in the inbox first.
			perRule: perRule.map(({ open, other, ...p }) => ({
				...p,
				examples: [...open, ...other].slice(0, 3)
			})),
			moves,
			total: rows.length
		};
	}

	/** Change some settings (each one checked), and re-classify the threads if it matters. */
	async updateSettings(
		body: Partial<Settings>
	): Promise<Refusal | { settings: Settings; reclassified: number }> {
		const next: Settings = { ...(await this.settings()) };
		for (const k of [
			'pushAction',
			'pushFyi',
			'pushTurnChanges',
			'pushResolved',
			'peekMarksRead',
			'botsAreFyi',
			'teamReviewsAreAction'
		] as const)
			if (typeof body[k] === 'boolean') next[k] = body[k];
		if (body.dash !== undefined) {
			const dash = { ...next.dash, ...body.dash };
			const err = validateDash(dash);
			if (err) return { error: err, status: 400 };
			next.dash = dash;
		}
		if (body.reviewResolution !== undefined) {
			if (body.reviewResolution !== 'strict' && body.reviewResolution !== 'any_review')
				return { error: 'reviewResolution must be "strict" or "any_review".', status: 400 };
			next.reviewResolution = body.reviewResolution;
		}
		if (body.views !== undefined) {
			// A view's conditions are checked like a rule's (a rule with a no-op result).
			const whenError = (when: unknown) =>
				validateRules([{ when, then: { category: 'fyi' } }])?.replace(/^Rule 1: /, '') ?? null;
			const err = validateViews(body.views, whenError);
			if (err) return { error: err, status: 400 };
			next.views = body.views;
		}
		if (body.menus !== undefined) {
			const menus = { ...next.menus, ...body.menus, v: MENUS_VERSION };
			const err = validateMenus(menus);
			if (err) return { error: err, status: 400 };
			next.menus = menus;
		}
		if (body.rules !== undefined) {
			const err = validateRules(body.rules);
			if (err) return { error: err, status: 400 };
			next.rules = body.rules;
		}
		await this.saveSettings(next);
		// Only these settings change how threads are classified; the rest (menus, dashboards, push)
		// must not rewrite every thread.
		const affects =
			body.rules !== undefined ||
			typeof body.botsAreFyi === 'boolean' ||
			body.reviewResolution !== undefined ||
			typeof body.teamReviewsAreAction === 'boolean';
		const reclassified = affects ? await this.reclassify(next) : 0;
		return { settings: next, reclassified };
	}

	/** Re-run the classifier on stored threads after the settings change. */
	private async reclassify(settings: Settings): Promise<number> {
		const me = await this.login();
		const myTeams = await this.inboxTeamsFor(settings);
		const changes: (() => void)[] = [];
		for (const r of this.threads('1')) {
			if (r.rule === MUTED_BY_USER) continue;
			const c = classify(factsFromRow(r, me, myTeams), settings);
			const same =
				c.category === r.category &&
				c.kind === r.kind &&
				c.summary === r.summary &&
				(c.rule ?? null) === r.rule &&
				c.actionUrl === r.action_url;
			if (same) continue;
			changes.push(() =>
				this.run(
					`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?,
             rule = ? WHERE id = ?`,
					c.category,
					c.kind,
					c.summary,
					c.why,
					c.actionLabel,
					c.actionUrl,
					c.rule ?? null,
					r.id
				)
			);
		}
		if (changes.length) {
			this.transaction(() => changes.forEach((change) => change()));
			await this.bumpVersion();
		}
		return changes.length;
	}

	// --- Push devices ---------------------------------------------------------------------

	pushDevices(): { id: string; endpoint: string; label: string | null; createdAt: number }[] {
		return this.all<{ endpoint: string; label: string | null; created_at: number }>(
			'SELECT endpoint, label, created_at FROM push_devices ORDER BY created_at'
		).map((d) => ({
			id: d.endpoint,
			endpoint: d.endpoint,
			label: d.label,
			createdAt: d.created_at
		}));
	}

	async subscribe(sub: {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
		label?: string;
	}): Promise<Refusal | { ok: true }> {
		const endpoint = sub.endpoint;
		if (!endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys.auth)
			return { error: 'Invalid push subscription', status: 400 };
		// Each device costs a request per push; keep a poll well inside the subrequest limit.
		const others = this.one<{ n: number }>(
			'SELECT COUNT(*) AS n FROM push_devices WHERE endpoint != ?',
			endpoint
		);
		if ((others?.n ?? 0) >= MAX_DEVICES)
			return {
				error: `Up to ${MAX_DEVICES} devices can get push. Remove one in Settings first.`,
				status: 400
			};
		this.run(
			`INSERT INTO push_devices (endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label`,
			endpoint,
			sub.keys.p256dh,
			sub.keys.auth,
			sub.label?.slice(0, 80) ?? null,
			Date.now()
		);
		await this.setHasPush(true);
		return { ok: true };
	}

	async unsubscribe(endpoint: string): Promise<{ ok: true }> {
		this.run('DELETE FROM push_devices WHERE endpoint = ?', endpoint);
		const left = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM push_devices');
		await this.setHasPush((left?.n ?? 0) > 0);
		return { ok: true };
	}

	async testPush(origin: string): Promise<Refusal | { sent: number; statuses: number[] }> {
		if (!this.env.VAPID_PRIVATE_KEY)
			return { error: 'VAPID keys are not configured on the server.', status: 500 };
		const devices = this.all<{ endpoint: string; p256dh: string; auth: string }>(
			'SELECT endpoint, p256dh, auth FROM push_devices'
		);
		if (!devices.length) return { error: 'No devices are subscribed.', status: 400 };
		const vapid = vapidFromEnv(this.env, origin);
		const statuses = await Promise.all(
			devices.map((d) =>
				sendPush(
					d,
					{
						title: 'Hush is connected',
						body: 'Push notifications work on this device.',
						url: `${origin}/inbox`,
						tag: 'test'
					},
					vapid
				).catch(() => 0)
			)
		);
		return { sent: statuses.filter((s) => s >= 200 && s < 300).length, statuses };
	}

	// --- Alert history --------------------------------------------------------------------

	alerts(): AlertDTO[] {
		const rows = this.all<{
			id: number;
			sent_at: number;
			title: string;
			body: string;
			url: string;
			tid: string | null;
			repo: string;
			ttitle: string;
			html_url: string;
			triage: string;
			snoozed_until: number | null;
			resolved_note: string | null;
			subject_key: string | null;
		}>(
			`SELECT a.id, a.sent_at, a.title, a.body, a.url, t.id AS tid, t.repo, t.title AS ttitle,
         t.html_url, t.triage, t.snoozed_until, t.resolved_note, t.subject_key
       FROM alerts a LEFT JOIN threads t ON t.id = a.thread_id
       ORDER BY a.sent_at DESC, a.id DESC LIMIT 100`
		);
		const now = Date.now();
		const state = (r: (typeof rows)[number]) =>
			r.triage === 'done'
				? (r.resolved_note ?? 'Done')
				: r.triage === 'muted'
					? 'Muted'
					: r.triage === 'snoozed' && (r.snoozed_until ?? 0) > now
						? 'Snoozed'
						: null;
		return rows.map((r) => ({
			id: r.id,
			sentAt: r.sent_at,
			title: r.title,
			body: r.body,
			url: r.url,
			thread: r.tid
				? {
						repo: r.repo,
						number: subjectRefOf({ id: r.tid, subject_key: r.subject_key })?.number ?? null,
						title: r.ttitle,
						htmlUrl: r.html_url,
						state: state(r)
					}
				: null
		}));
	}

	// --- Dashboard marks: hidden, moved, and your order -----------------------------------

	/** A dashboard with your marks applied (hidden and moved last until the item changes). */
	async dashboardView(kind: DashKind, force: boolean): Promise<DashResponse> {
		const data = await this.dashboard(kind, force);
		const hidden = this.all<{ item_id: string; updated_at: string }>('SELECT * FROM dash_hidden');
		const moves = this.all<{ item_id: string; turn: Turn; updated_at: string }>(
			'SELECT * FROM dash_moves'
		);
		const order = this.all<{ item_id: string; rank: number }>('SELECT * FROM dash_order');
		// Hidden and moved last "until it changes": a newer updatedAt undoes them.
		const unchanged = (i: DashItem, at: string | undefined) =>
			!!at && Date.parse(i.updatedAt) <= Date.parse(at);
		const hiddenAt = new Map(hidden.map((h) => [h.item_id, h.updated_at]));
		const moved = new Map(moves.map((m) => [m.item_id, m]));
		const ranks = new Map(order.map((o) => [o.item_id, o.rank]));
		for (const i of data.items) {
			i.dismissed = unchanged(i, hiddenAt.get(i.id));
			const m = moved.get(i.id);
			i.autoTurn = i.turn;
			i.movedByYou = !!m && unchanged(i, m.updated_at) && m.turn !== i.turn;
			if (i.movedByYou) i.turn = m!.turn;
			i.rank = ranks.get(i.id) ?? null;
		}
		return data;
	}

	/** Save a drop: moves to another group (`turn`, or null to undo a move) and the new order. */
	arrange(items: (ItemRef & { turn?: Turn | null })[], order: string[]): { ok: true } {
		this.transaction(() => {
			for (const item of items) {
				if (item.turn === null) this.run('DELETE FROM dash_moves WHERE item_id = ?', item.id);
				else if (item.turn)
					this.run(
						`INSERT INTO dash_moves (item_id, turn, updated_at) VALUES (?, ?, ?)
             ON CONFLICT (item_id) DO UPDATE SET turn = excluded.turn, updated_at = excluded.updated_at`,
						item.id,
						item.turn,
						item.updatedAt
					);
			}
			order.forEach((id, rank) =>
				this.run(
					`INSERT INTO dash_order (item_id, rank) VALUES (?, ?)
           ON CONFLICT (item_id) DO UPDATE SET rank = excluded.rank`,
					id,
					rank
				)
			);
		});
		return { ok: true };
	}

	hide(items: ItemRef[]): { ok: true } {
		this.transaction(() => {
			for (const i of items)
				this.run(
					`INSERT INTO dash_hidden (item_id, updated_at) VALUES (?, ?)
           ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at`,
					i.id,
					i.updatedAt
				);
		});
		return { ok: true };
	}

	unhide(ids: string[]): { ok: true } {
		this.transaction(() => {
			for (const id of ids) this.run('DELETE FROM dash_hidden WHERE item_id = ?', id);
		});
		return { ok: true };
	}
}
