import {
	classify,
	classifyDefault,
	firstMatchingRule,
	globToRegExp,
	ruleTriage,
	validateRules,
	withOverride
} from '../../src/lib/shared/classify';
import { MENUS_VERSION } from '../../src/lib/shared/menus';
import { changesSince, snapshotOf, type Snapshot } from '../../src/lib/shared/changes';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import { FEED_TABS, threadMatches } from '../../src/lib/shared/views';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import {
	RECLASSIFY_KEYS,
	mergeSettings,
	validateSettings
} from '../../src/lib/shared/settings-schema';
import {
	SNOOZE_EVENT_MAX_MS,
	snoozeEvent,
	snoozeOutcome,
	type SnoozeEvent
} from '../../src/lib/shared/snooze';
import type {
	AlertDTO,
	Change,
	Counts,
	DashItem,
	DashKind,
	DashResponse,
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

/** Why a thread or item does not need you ("Doesn't need me…"): what each answer changes. */
export type NotNeededAnswer = 'others-reviewed' | 'team' | 'bots' | 'repo' | 'once';
const NOT_NEEDED = new Set<NotNeededAnswer>(['others-reviewed', 'team', 'bots', 'repo', 'once']);
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
	async me(): Promise<{ settings: Settings; status: PollStatus; onboarded: boolean }> {
		const [settings, status, onboarded] = await Promise.all([
			this.settings(),
			this.status(),
			this.ctx.storage.get<boolean>('onboarded')
		]);
		return { settings, status, onboarded: !!onboarded };
	}

	/**
	 * What Hush found, for the first-run card: the counts, what it finished by itself, and the
	 * repos with the most threads that do not need you (the noise).
	 */
	async summary(): Promise<{
		counts: Counts;
		notifications: number;
		done: number;
		noisyRepos: { repo: string; count: number }[];
	}> {
		const notifications = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM threads')?.n ?? 0;
		const done =
			this.one<{ n: number }>(`SELECT COUNT(*) AS n FROM threads WHERE triage = 'done'`)?.n ?? 0;
		const noisyRepos = this.all<{ repo: string; count: number }>(
			`SELECT repo, COUNT(*) AS count FROM threads WHERE category != 'action'
       GROUP BY repo ORDER BY count DESC LIMIT 6`
		);
		return { counts: this.counts(), notifications, done, noisyRepos };
	}

	/** The first-run questions were answered or skipped: the card does not show again. */
	async setOnboarded(): Promise<{ ok: true }> {
		await this.ctx.storage.put('onboarded', true);
		return { ok: true };
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
		// A search of every tab reads more (Done threads stay 30 days).
		const limit = view === 'all' ? 500 : 300;
		const rows = this.threads(`${where} ORDER BY ${order} LIMIT ${limit}`, ...args);
		const since = this.sinceYouLooked(
			rows.flatMap((r) =>
				r.subject_key && r.facts ? [{ key: r.subject_key, facts: r.facts }] : []
			),
			await this.login()
		);
		const threads = rows.map((r) => {
			const dto = toDTO(r);
			const s = r.subject_key ? since.get(r.subject_key) : undefined;
			return s ? { ...dto, ...s } : dto;
		});
		return { threads, counts: this.counts(), etag };
	}

	/**
	 * "Since you looked", for PRs and issues (by key, with their facts JSON): what changed since
	 * your last look, and when that was. Keys you never looked at are left out.
	 */
	protected sinceYouLooked(
		subjects: { key: string; facts: string }[],
		me: string
	): Map<string, { changes: Change[]; seenAt: number }> {
		const out = new Map<string, { changes: Change[]; seenAt: number }>();
		const keys = [...new Set(subjects.map((s) => s.key))];
		if (!keys.length) return out;
		const seen = new Map(
			this.all<{ key: string; at: number; snapshot: string }>(
				`SELECT key, at, snapshot FROM seen WHERE key IN (SELECT value FROM json_each(?))`,
				JSON.stringify(keys)
			).map((r) => [r.key, r])
		);
		for (const { key, facts } of subjects) {
			const s = seen.get(key);
			if (!s || out.has(key)) continue;
			const now = JSON.parse(facts) as SubjectFacts;
			out.set(key, {
				changes: changesSince(JSON.parse(s.snapshot) as Snapshot, now, me),
				seenAt: s.at
			});
		}
		return out;
	}

	/** You looked at these PRs or issues ("owner/repo#123"): "since you looked" starts again. */
	async markSeen(keys: string[]): Promise<{ ok: true }> {
		keys = [...new Set(keys.filter((k) => typeof k === 'string' && k.includes('#')))].slice(0, 50);
		if (!keys.length) return { ok: true };
		const me = await this.login();
		const facts = this.all<{ key: string; facts: string }>(
			`SELECT key, facts FROM subjects WHERE key IN (SELECT value FROM json_each(?))`,
			JSON.stringify(keys)
		);
		const old = new Map(
			this.all<{ key: string; snapshot: string }>(
				`SELECT key, snapshot FROM seen WHERE key IN (SELECT value FROM json_each(?))`,
				JSON.stringify(keys)
			).map((r) => [r.key, r.snapshot])
		);
		// Only what changed since the last look: each write counts against the daily row budget.
		const writes = facts
			.map((f) => ({ key: f.key, snapshot: JSON.stringify(snapshotOf(JSON.parse(f.facts), me)) }))
			.filter((w) => old.get(w.key) !== w.snapshot);
		if (!writes.length) return { ok: true };
		const now = Date.now();
		this.transaction(() => {
			for (const w of writes)
				this.run(
					`INSERT INTO seen (key, at, snapshot) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET at = excluded.at, snapshot = excluded.snapshot`,
					w.key,
					now,
					w.snapshot
				);
		});
		await this.bumpVersion();
		this.broadcast({ type: 'dash', kind: 'pr' });
		this.broadcast({ type: 'dash', kind: 'issue' });
		return { ok: true };
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
						const cls = withOverride(classify(factsFromRow(t, me), settings!), t, t.gh_updated_at);
						set(t, `category = ?, rule = ?, triage = 'inbox'`, cls.category, cls.rule ?? null);
						break;
					}
				}
		});
		await this.bumpVersion();

		// One record per PR or issue: Done or Mute here also hides it on the dashboards (until it
		// changes), and moving it back shows it there again.
		const keys = [...new Set(threads.flatMap((t) => (t.subject_key ? [t.subject_key] : [])))];
		if (action === 'done' || action === 'mute') this.markDashboards(keys, true);
		if (action === 'undone' || action === 'unmute') this.markDashboards(keys, false);

		if (action === 'done' || action === 'read' || action === 'mute')
			await this.mirrorOnGitHub(
				action,
				threads.map((t) => t.id)
			);
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

	/**
	 * An Atom feed of one inbox tab (see worker/feeds.ts): its name and its threads, newest first.
	 * Null when the tab is gone (a deleted saved view).
	 */
	async feedThreads(view: string): Promise<{ name: string; rows: ThreadWithFacts[] } | null> {
		const tab = FEED_TABS.find((t) => t.id === view);
		const saved = tab ? null : (await this.settings()).views.find((v) => `v:${v.id}` === view);
		if (!tab && !saved) return null;
		const { where, args } = viewWhere(saved?.base ?? view);
		const rows = this.threads(`${where} ORDER BY gh_updated_at DESC LIMIT 300`, ...args);
		if (!saved) return { name: tab!.label, rows: rows.slice(0, 50) };
		const me = await this.login();
		return {
			name: saved.name,
			rows: rows.filter((r) => threadMatches(saved.query, toDTO(r), me)).slice(0, 50)
		};
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
				moves: { action: number; fyi: number; muted: number; done: number; snoozed: number };
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
		const moves = { action: 0, fyi: 0, muted: 0, done: 0, snoozed: 0 };
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
			// A rule that moves threads acts on the inbox threads it starts to match (see reclassify).
			const then = i >= 0 ? settings.rules[i].then : null;
			const name = i >= 0 ? settings.rules[i].name || `Rule ${i + 1}` : null;
			if (then?.triage && r.triage === 'inbox' && name !== r.rule)
				moves[then.triage === 'done' ? 'done' : 'snoozed']++;
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
	/**
	 * Save a settings patch. With `replace`, the patch is all your changes (settings.json, an
	 * imported file): every setting it does not have goes back to its default.
	 */
	async updateSettings(
		body: Partial<Settings>,
		replace = false
	): Promise<Refusal | { settings: Settings; reclassified: number }> {
		if (typeof body !== 'object' || body === null || Array.isArray(body))
			return { error: 'Settings must be an object.', status: 400 };
		const old = await this.settings();
		const next = mergeSettings(replace ? structuredClone(DEFAULT_SETTINGS) : old, body);
		if (next.menus) next.menus = { ...next.menus, v: MENUS_VERSION };
		const err = validateSettings(next, Object.keys(body));
		if (err) return { error: err, status: 400 };
		await this.saveSettings(next);
		// Only these settings change how threads are sorted; the rest (menus, dashboards, push)
		// must not rewrite every thread.
		const affects = RECLASSIFY_KEYS.some((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
		const reclassified = affects ? await this.reclassify(next) : 0;
		return { settings: next, reclassified };
	}

	/**
	 * Re-run the classifier on stored threads after the settings change. A rule that moves threads
	 * acts on the inbox threads it starts to match.
	 */
	private async reclassify(settings: Settings): Promise<number> {
		const me = await this.login();
		const myTeams = await this.inboxTeamsFor(settings);
		const now = Date.now();
		const changes: (() => void)[] = [];
		const done: { id: string; note: string }[] = [];
		for (const r of this.threads('1')) {
			if (r.rule === MUTED_BY_USER) continue;
			const c = withOverride(classify(factsFromRow(r, me, myTeams), settings), r, r.gh_updated_at);
			const moved =
				r.triage === 'inbox' && !!c.rule && c.rule !== r.rule ? ruleTriage(c, now) : null;
			const same =
				!moved &&
				c.category === r.category &&
				c.kind === r.kind &&
				c.summary === r.summary &&
				(c.rule ?? null) === r.rule &&
				c.actionUrl === r.action_url;
			if (same) continue;
			if (moved?.triage === 'done') done.push({ id: r.id, note: moved.note });
			changes.push(() =>
				this.run(
					`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?,
             rule = ?, triage = ?, resolved_at = ?, resolved_note = ?, snoozed_until = ?, snoozed_at = ?
           WHERE id = ?`,
					c.category,
					c.kind,
					c.summary,
					c.why,
					c.actionLabel,
					c.actionUrl,
					c.rule ?? null,
					moved?.triage ?? r.triage,
					moved ? null : r.resolved_at,
					moved?.triage === 'done' ? moved.note : r.resolved_note,
					moved?.triage === 'snoozed' ? moved.until : r.snoozed_until,
					moved?.triage === 'snoozed' ? now : r.snoozed_at,
					r.id
				)
			);
		}
		if (changes.length) {
			this.transaction(() => changes.forEach((change) => change()));
			await this.bumpVersion();
		}
		await this.notifyResolved(done);
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
		// "Since you looked", from the stored facts of each item (the same record as the inbox's).
		const facts = this.all<{ key: string; facts: string }>(
			`SELECT key, facts FROM subjects WHERE key IN (SELECT value FROM json_each(?))`,
			JSON.stringify(data.items.map((i) => i.id))
		);
		const since = this.sinceYouLooked(facts, await this.login());
		for (const i of data.items) {
			const s = since.get(i.id);
			i.changes = s?.changes ?? [];
			i.seenAt = s?.seenAt ?? null;
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

	/**
	 * "Doesn't need me": Hush was wrong about a thread (its id) or a dashboard item (its
	 * "owner/repo#123"). Each answer changes what would have been right: a setting, or a rule to
	 * FYI; or only this PR or issue, until it changes ("once": FYI in the inbox, Other on the
	 * dashboards). Returns how to undo it.
	 */
	async notNeeded(
		id: string,
		answer: NotNeededAnswer
	): Promise<
		Refusal | { settings?: Settings; undo: { settings?: Partial<Settings>; once?: string } }
	> {
		if (!NOT_NEEDED.has(answer)) return { error: 'Unknown answer', status: 400 };
		const thread = id.includes('#')
			? null
			: this.one<{ repo: string }>('SELECT repo FROM threads WHERE id = ?', id);
		const repo = thread?.repo ?? (id.includes('#') ? id.slice(0, id.lastIndexOf('#')) : null);
		if (!repo) return { error: 'Not found', status: 404 };
		if (answer === 'once') {
			await this.onlyThisOne(id, true);
			return { undo: { once: id } };
		}
		const old = await this.settings();
		const patch: Partial<Settings> =
			answer === 'others-reviewed'
				? { reviewResolution: 'any_review' }
				: answer === 'team'
					? { teamReviewsAreAction: false }
					: answer === 'bots'
						? { botsAreFyi: true }
						: {
								rules: [
									{ name: `${repo} is FYI`, when: `repo:${repo}`, then: { category: 'fyi' } },
									...old.rules
								]
							};
		const undo = Object.fromEntries(
			Object.keys(patch).map((k) => [k, old[k as keyof Settings]])
		) as Partial<Settings>;
		const r = await this.updateSettings(patch);
		if ('error' in r) return r;
		return { settings: r.settings, undo: { settings: undo } };
	}

	/**
	 * "Only this one", on both sides of the one record: the PR or issue's threads are FYI until
	 * they change, and its dashboard item is in Other until it changes. `on: false` undoes it.
	 */
	async onlyThisOne(id: string, on: boolean): Promise<{ ok: true }> {
		const key = id.includes('#')
			? id
			: (this.one<{ subject_key: string | null }>(
					'SELECT subject_key FROM threads WHERE id = ?',
					id
				)?.subject_key ?? null);
		const ids = key
			? this.all<{ id: string }>('SELECT id FROM threads WHERE subject_key = ?', key).map(
					(t) => t.id
				)
			: [id];
		if (ids.length)
			this.run(
				`UPDATE threads SET override = ?, override_updated_at = CASE WHEN ? THEN gh_updated_at END
         WHERE id IN (${marks(ids.length)})`,
				on ? 'fyi' : null,
				on ? 1 : 0,
				...ids
			);
		await this.reclassify(await this.settings());
		if (key) {
			if (on)
				this.run(
					`INSERT INTO dash_moves (item_id, turn, updated_at) VALUES (?, 'none', ?)
           ON CONFLICT (item_id) DO UPDATE SET turn = excluded.turn, updated_at = excluded.updated_at`,
					key,
					new Date().toISOString()
				);
			else this.run('DELETE FROM dash_moves WHERE item_id = ?', key);
			this.broadcast({ type: 'dash', kind: 'pr' });
			this.broadcast({ type: 'dash', kind: 'issue' });
		}
		return { ok: true };
	}

	/** Hide until it changes: on the dashboards, and Done in the inbox (one record of each). */
	async hide(items: ItemRef[]): Promise<{ ok: true }> {
		this.transaction(() => {
			for (const i of items)
				this.run(
					`INSERT INTO dash_hidden (item_id, updated_at) VALUES (?, ?)
           ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at`,
					i.id,
					i.updatedAt
				);
		});
		await this.markInbox(
			items.map((i) => i.id),
			true
		);
		return { ok: true };
	}

	async unhide(ids: string[]): Promise<{ ok: true }> {
		this.transaction(() => {
			for (const id of ids) this.run('DELETE FROM dash_hidden WHERE item_id = ?', id);
		});
		await this.markInbox(ids, false);
		return { ok: true };
	}

	/**
	 * The dashboards' side of Done in the inbox: hidden from now until the PR or issue changes, or
	 * shown again. Open dashboards refresh (from the cache: no GitHub requests).
	 */
	private markDashboards(keys: string[], hidden: boolean) {
		if (!keys.length) return;
		const now = new Date().toISOString();
		this.transaction(() => {
			for (const key of keys)
				if (hidden)
					this.run(
						`INSERT INTO dash_hidden (item_id, updated_at) VALUES (?, ?)
             ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at`,
						key,
						now
					);
				else this.run('DELETE FROM dash_hidden WHERE item_id = ?', key);
		});
		this.broadcast({ type: 'dash', kind: 'pr' });
		this.broadcast({ type: 'dash', kind: 'issue' });
	}

	/**
	 * The inbox's side of hiding on a dashboard: the threads of these PRs or issues go to Done (and
	 * are marked done on GitHub), or back to the inbox. Muted threads stay muted.
	 */
	private async markInbox(keys: string[], done: boolean) {
		if (!keys.length) return;
		const threads = this.all<{ id: string }>(
			`SELECT id FROM threads WHERE subject_key IN (${marks(keys.length)}) AND category != 'muted'
       AND triage ${done ? "!= 'done'" : "= 'done'"}`,
			...keys
		);
		if (!threads.length) return;
		const ids = threads.map((t) => t.id);
		this.run(
			done
				? `UPDATE threads SET triage = 'done', snoozed_until = NULL, snooze_event = NULL, unread = 0,
           resolved_at = NULL, resolved_note = NULL WHERE id IN (${marks(ids.length)})`
				: `UPDATE threads SET triage = 'inbox', resolved_at = NULL, resolved_note = NULL
           WHERE id IN (${marks(ids.length)})`,
			...ids
		);
		await this.bumpVersion();
		if (done) await this.mirrorOnGitHub('done', ids);
	}

	/** Mirror a choice on GitHub in the background (not from a local test copy). */
	private async mirrorOnGitHub(action: 'done' | 'read' | 'mute', ids: string[]) {
		if (this.env.GITHUB_WRITES === 'off' || !ids.length) return;
		const token = await userToken(this.env, (await this.account())!);
		const mirror = (id: string) =>
			action === 'done'
				? markThreadDone(token, id)
				: action === 'read'
					? markThreadRead(token, id)
					: muteThread(token, id).then(() => markThreadDone(token, id));
		this.ctx.waitUntil(Promise.allSettled(ids.map(mirror)));
	}
}
