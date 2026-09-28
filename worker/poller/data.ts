import { compileRules, place, validateRules } from '../../src/lib/shared/place';
import { snapshotOf } from '../../src/lib/shared/changes';
import { FEED_LANES, searchItems } from '../../src/lib/shared/search';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import {
	REPLACE_KEYS,
	mergeSettings,
	validateSettings
} from '../../src/lib/shared/settings-schema';
import {
	SNOOZE_EVENT_MAX_MS,
	snoozeEvent,
	snoozeOutcome,
	type SnoozeEvent
} from '../../src/lib/shared/snooze';
import { enrichmentOf } from '../../src/lib/shared/subject';
import type { AlertDTO, Counts, ItemDTO, Lane, Rule, Settings } from '../../src/lib/shared/types';
import { userToken } from '../db';
import { sendPush, vapidFromEnv } from '../webpush';
import { PollerSearches } from './searches';
import {
	factsOf,
	itemFactsOf,
	laneOf,
	subjectRefOf,
	toDTO,
	viewWhere,
	type ItemWithFacts,
	type ListView
} from './schema';
import { FINISHED_SHOW, MIN, type PollStatus } from './shared';

/** A request the Durable Object refused; the route answers with this status. */
export type Refusal = { error: string; status: 400 | 404 | 500 };

export type ItemAction = 'done' | 'restore' | 'snooze' | 'mute' | 'seen' | 'my-turn' | 'not-mine';
const ITEM_ACTIONS = new Set<ItemAction>([
	'done',
	'restore',
	'snooze',
	'mute',
	'seen',
	'my-turn',
	'not-mine'
]);
/** Why an item is not your turn: each answer changes what would have been right. */
export type NotMineAnswer = 'once' | 'others-reviewed' | 'team' | 'bots' | 'repo';
const ANSWERS = new Set<NotMineAnswer>(['once', 'others-reviewed', 'team', 'bots', 'repo']);

// Mute makes 2 GitHub calls per thread; 20 × 2 stays under the Free plan's 50 subrequests.
const BULK_MAX = 20;
const MAX_DEVICES = 10;
const VIEWS = new Set<ListView>(['turn', 'waiting', 'updates', 'done', 'snoozed', 'muted', 'all']);
/** An open app records a visit (and brings the next poll forward) at most this often. */
const SEEN_EVERY = 5 * MIN;

const marks = (n: number) => Array(n).fill('?').join(',');

/**
 * The user's data, for the API routes: the routes check the request's shape and answer; the
 * reads and writes happen here, next to the poller that also writes them.
 */
export abstract class PollerData extends PollerSearches {
	// In the top class (worker/poller.ts), with the poll schedule.
	abstract touch(origin?: string): Promise<void>;
	abstract setHasPush(hasPush: boolean): Promise<void>;
	abstract status(): Promise<PollStatus>;

	/** For /api/me: your settings and the poll status, in one call. */
	async me(): Promise<{ settings: Settings; status: PollStatus; onboarded: boolean }> {
		const [settings, status, onboarded] = await Promise.all([
			this.checkedSettings(),
			this.status(),
			this.ctx.storage.get<boolean>('onboarded')
		]);
		return { settings, status, onboarded: !!onboarded };
	}

	/** Your GitHub login; the routes call only after the session check, so the account exists. */
	private async login(): Promise<string> {
		const user = await this.account();
		if (!user) throw new Error('Not signed in.');
		return user.login;
	}

	// --- Items ----------------------------------------------------------------------------

	counts(): Counts {
		const turn = viewWhere('turn');
		const waiting = viewWhere('waiting');
		const updates = viewWhere('updates');
		const row = this.one<Counts>(
			`SELECT SUM(CASE WHEN ${turn.where} THEN 1 ELSE 0 END) AS turn,
         SUM(CASE WHEN ${waiting.where} THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN ${updates.where} AND (seen_at IS NULL OR activity_at > strftime('%Y-%m-%dT%H:%M:%SZ', seen_at / 1000, 'unixepoch')) THEN 1 ELSE 0 END) AS updates
       FROM items`,
			...turn.args,
			...waiting.args,
			...updates.args
		);
		return { turn: row?.turn ?? 0, waiting: row?.waiting ?? 0, updates: row?.updates ?? 0 };
	}

	/**
	 * One list. `ifNoneMatch` is the client's ETag: when nothing changed, answer without reading
	 * any items. Opening the app also counts as a visit (see SEEN_EVERY).
	 */
	async listItems(
		view: ListView,
		ifNoneMatch: string | null,
		origin: string
	): Promise<
		| Refusal
		| { notModified: true; etag: string }
		| { items: ItemDTO[]; counts: Counts; finished: ItemDTO[]; etag: string }
	> {
		if (!VIEWS.has(view)) return { error: 'Unknown list', status: 400 };
		const seen = (await this.ctx.storage.get<number>('lastActive')) ?? 0;
		if (Date.now() - seen >= SEEN_EVERY) this.ctx.waitUntil(this.touch(origin));
		const version = (await this.ctx.storage.get<number>('itemsVersion')) ?? 0;
		const etag = `W/"${version}.${view}"`;
		if (ifNoneMatch === etag) return { notModified: true, etag };
		const me = await this.login();
		const { staleDays } = await this.checkedSettings();
		const { where, args } = viewWhere(view);
		const order =
			view === 'turn' || view === 'waiting'
				? 'priority ASC, waiting_since ASC'
				: view === 'snoozed'
					? 'snoozed_until ASC'
					: 'activity_at DESC';
		const dto = (r: ItemWithFacts) => toDTO(r, me, staleDays);
		const items = this.items(`${where} ORDER BY ${order} LIMIT 300`, ...args).map(dto);
		// "Hush finished these for you": only with Your turn.
		const finishedSeen = (await this.ctx.storage.get<number>('finishedSeenAt')) ?? 0;
		const finished =
			view === 'turn'
				? this.items(
						`finished_at > ? AND state = 'active' AND COALESCE(override, lane) != 'turn'
             ORDER BY finished_at DESC LIMIT 10`,
						Math.max(Date.now() - FINISHED_SHOW, finishedSeen)
					).map(dto)
				: [];
		return { items, counts: this.counts(), finished, etag };
	}

	/** One item (the item page, a link from a push). */
	async item(key: string): Promise<Refusal | ItemDTO> {
		const me = await this.login();
		const r = this.items('items.key = ?', key)[0];
		if (!r) return { error: 'Not found', status: 404 };
		return toDTO(r, me, (await this.checkedSettings()).staleDays);
	}

	/** The strip "Hush finished these for you" was read: hide the ones it showed. */
	async finishedSeen(): Promise<{ ok: true }> {
		await this.ctx.storage.put('finishedSeenAt', Date.now());
		await this.bumpVersion();
		return { ok: true };
	}

	/** The first-run numbers: what is waiting on you, and how much went to Updates. */
	async summary(): Promise<{
		counts: Counts;
		notifications: number;
		updates: number;
		noisyRepos: { repo: string; count: number }[];
	}> {
		const notifications = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM threads')?.n ?? 0;
		const updates =
			this.one<{ n: number }>(
				`SELECT COUNT(*) AS n FROM items WHERE COALESCE(override, lane) = 'updates'`
			)?.n ?? 0;
		const noisyRepos = this.all<{ repo: string; count: number }>(
			`SELECT repo, COUNT(*) AS count FROM items WHERE COALESCE(override, lane) = 'updates'
       GROUP BY repo ORDER BY count DESC LIMIT 6`
		);
		return { counts: this.counts(), notifications, updates, noisyRepos };
	}

	async setOnboarded(): Promise<{ ok: true }> {
		await this.ctx.storage.put('onboarded', true);
		return { ok: true };
	}

	/** Apply one action to up to BULK_MAX items, in one transaction. */
	async itemAction(
		keys: string[],
		action: ItemAction,
		body: { until?: number; event?: SnoozeEvent }
	): Promise<Refusal | { ok: true; updated: number; counts: Counts }> {
		if (!ITEM_ACTIONS.has(action) || action === 'not-mine')
			return { error: 'Unknown action', status: 400 };
		if (!keys.length || keys.length > BULK_MAX || keys.some((k) => typeof k !== 'string'))
			return { error: `Select 1 to ${BULK_MAX} items.`, status: 400 };
		// "Until something happens": the time is only a deadline (default 7 days).
		const event = action === 'snooze' ? (body.event ?? null) : null;
		if (event && !snoozeEvent(event)) return { error: 'Unknown snooze condition.', status: 400 };
		const until =
			action === 'snooze' ? (body.until ?? (event ? Date.now() + SNOOZE_EVENT_MAX_MS : 0)) : 0;
		if (action === 'snooze' && until < Date.now())
			return { error: 'Snooze time must be in the future.', status: 400 };

		const me = await this.login();
		let items = this.items(`items.key IN (${marks(keys.length)})`, ...keys);
		if (!items.length) return { error: 'Not found', status: 404 };
		// A state that is already true would end the snooze at once: refuse it with a reason.
		if (event) {
			const ev = snoozeEvent(event)!;
			const now = Date.now();
			const kindOf = (t: ItemWithFacts) => factsOf(t)?.kind ?? 'other';
			if (items.some((t) => !ev.kinds.includes(kindOf(t) as 'pr' | 'issue')))
				return {
					error: `"${ev.label}" works only for ${ev.kinds.map((k) => (k === 'pr' ? 'pull requests' : 'issues')).join(' and ')}.`,
					status: 400
				};
			const endsNow = (t: ItemWithFacts) => {
				const f = factsOf(t);
				return snoozeOutcome(ev.id, f ? enrichmentOf(f, me) : null, now, me);
			};
			const already = items.filter((t) => endsNow(t).wake);
			if (already.length === items.length) {
				const o = endsNow(already[0]);
				return {
					error: `${o.wake ? o.reason : 'Done'} already. Pick another condition.`,
					status: 400
				};
			}
			items = items.filter((t) => !already.includes(t));
		}

		const set = (t: ItemWithFacts, sql: string, ...args: (string | number | null)[]) =>
			this.run(`UPDATE items SET ${sql} WHERE key = ?`, ...args, t.key);
		const now = Date.now();
		const snapshot = (t: ItemWithFacts) => {
			const f = factsOf(t);
			return f ? JSON.stringify(snapshotOf(f, me)) : t.seen_snapshot;
		};
		this.transaction(() => {
			for (const t of items)
				switch (action) {
					case 'done':
						set(
							t,
							`state = 'done', done_sig = sig, snoozed_until = NULL, snooze_event = NULL,
               finished_at = NULL, finished_note = NULL, seen_at = ?, seen_snapshot = ?`,
							now,
							snapshot(t)
						);
						break;
					case 'restore':
						set(
							t,
							`state = 'active', done_sig = NULL, snoozed_until = NULL, snooze_event = NULL,
               snoozed_at = NULL, override = NULL, override_sig = NULL, finished_at = NULL, finished_note = NULL`
						);
						break;
					case 'snooze':
						set(
							t,
							`state = 'snoozed', snoozed_until = ?, snooze_event = ?, snoozed_at = ?`,
							until,
							event,
							now
						);
						break;
					case 'mute':
						set(t, `state = 'muted', snoozed_until = NULL, snooze_event = NULL`);
						break;
					case 'seen':
						set(t, `seen_at = ?, seen_snapshot = ?`, now, snapshot(t));
						break;
					case 'my-turn':
						set(
							t,
							`override = 'turn', override_sig = sig, state = 'active', done_sig = NULL,
               finished_at = NULL, finished_note = NULL`
						);
						break;
				}
		});
		await this.bumpVersion();

		// Mirror the change on GitHub in the background.
		const settings = await this.checkedSettings();
		const mirror =
			action === 'mute'
				? 'mute'
				: settings.markReadOnGitHub && (action === 'done' || action === 'seen')
					? action === 'done'
						? 'done'
						: 'read'
					: null;
		if (mirror) {
			const token = await userToken(this.env, (await this.account())!);
			this.mirrorOnGitHub(
				token,
				items.map((t) => t.key),
				mirror
			);
		}
		// Alerts for these items on your other devices: replace them with a quiet note.
		const NOTE: Partial<Record<ItemAction, string>> = {
			done: 'Done',
			mute: 'Muted',
			snooze: 'Snoozed'
		};
		const note = NOTE[action];
		if (note) this.ctx.waitUntil(this.notifyResolved(items.map((t) => ({ id: t.key, note }))));
		return { ok: true, updated: items.length, counts: this.counts() };
	}

	/**
	 * "Not my turn": Hush was wrong about an item. Each answer changes what would have been right
	 * (a setting, or a rule), or only moves this item (`once`). Returns how to undo it.
	 */
	async notMine(
		key: string,
		answer: NotMineAnswer
	): Promise<
		Refusal | { undo: { settings?: Partial<Settings>; restore?: string }; settings?: Settings }
	> {
		if (!ANSWERS.has(answer)) return { error: 'Unknown answer', status: 400 };
		const t = this.items('items.key = ?', key)[0];
		if (!t) return { error: 'Not found', status: 404 };
		if (answer === 'once') {
			this.run(
				`UPDATE items SET override = 'updates', override_sig = sig, finished_at = NULL, finished_note = NULL
         WHERE key = ?`,
				key
			);
			await this.bumpVersion();
			return { undo: { restore: key } };
		}
		const old = await this.checkedSettings();
		const patch: Partial<Settings> =
			answer === 'others-reviewed'
				? { reviewResolution: 'any_review' }
				: answer === 'team'
					? { teamReviewsAreMine: false }
					: answer === 'bots'
						? { botsAreUpdates: true }
						: {
								rules: [
									{
										name: `${t.repo} is updates`,
										when: `repo:${t.repo}`,
										then: { lane: 'updates' }
									},
									...old.rules
								]
							};
		const undo = Object.fromEntries(
			Object.keys(patch).map((k) => [k, old[k as keyof Settings]])
		) as Partial<Settings>;
		const r = await this.updateSettings(patch);
		if ('error' in r) return r;
		return { undo: { settings: undo }, settings: r.settings };
	}

	/**
	 * An Atom feed of one lane or saved search (see worker/feeds.ts): its name and its items,
	 * newest first. Null when the saved search is gone.
	 */
	async feedItems(view: string): Promise<{ name: string; items: ItemDTO[] } | null> {
		const lane = FEED_LANES.find((t) => t.id === view);
		const settings = await this.checkedSettings();
		const saved = lane ? null : settings.saved.find((v) => `s:${v.id}` === view);
		if (!lane && !saved) return null;
		const me = await this.login();
		const { where, args } = viewWhere((lane?.id as ListView) ?? 'all');
		const rows = this.items(`${where} ORDER BY activity_at DESC LIMIT 300`, ...args).map((r) =>
			toDTO(r, me, settings.staleDays)
		);
		const items = saved ? searchItems(rows, saved.query, me) : rows;
		return { name: lane?.label ?? saved!.name, items: items.slice(0, 50) };
	}

	// --- Settings -------------------------------------------------------------------------

	/**
	 * Try rules on your items without saving them: how many items each rule would catch (first
	 * match wins), a few examples, and how many items would change lane compared with the saved
	 * rules.
	 */
	async previewRules(rules: unknown): Promise<
		| Refusal
		| {
				perRule: { matches: number; examples: { title: string; repo: string; lane: string }[] }[];
				moves: Record<Lane, number>;
				total: number;
		  }
	> {
		const err = validateRules(rules);
		if (err) return { error: err, status: 400 };
		const who = await this.who();
		if (!who) return { error: 'Not signed in.', status: 400 };
		const draft = { ...who.settings, rules: rules as Rule[] };
		const compiledDraft = compileRules(draft.rules);
		const compiledSaved = compileRules(who.settings.rules);
		const rows = this.items('1');
		const perRule = draft.rules.map(() => ({
			matches: 0,
			examples: [] as { title: string; repo: string; lane: string }[]
		}));
		const moves: Record<Lane, number> = { turn: 0, waiting: 0, updates: 0, muted: 0 };
		for (const r of rows) {
			const f = itemFactsOf(r, factsOf(r), who.me, who.myTeams);
			const next = place(f, draft, compiledDraft);
			const now = place(f, who.settings, compiledSaved);
			const i = next.rule
				? draft.rules.findIndex((x, k) => (x.name || `Rule ${k + 1}`) === next.rule)
				: -1;
			if (i >= 0) {
				perRule[i].matches++;
				if (perRule[i].examples.length < 3)
					perRule[i].examples.push({ title: r.title, repo: r.repo, lane: next.lane });
			}
			if (next.lane !== now.lane) moves[next.lane]++;
		}
		return { perRule, moves, total: rows.length };
	}

	/**
	 * Save a settings patch. With `replace`, the patch is all your changes (settings.json, an
	 * imported file): every setting it does not have goes back to its default.
	 */
	async updateSettings(
		body: Partial<Settings>,
		replace = false
	): Promise<Refusal | { settings: Settings; replaced: number }> {
		if (typeof body !== 'object' || body === null || Array.isArray(body))
			return { error: 'Settings must be an object.', status: 400 };
		const old = await this.checkedSettings();
		const next = mergeSettings(replace ? structuredClone(DEFAULT_SETTINGS) : old, body);
		const err = validateSettings(next, Object.keys(body));
		if (err) return { error: err, status: 400 };
		await this.saveSettings(next);
		// Only these settings change where items go; the rest (menus, searches, push) must not
		// rewrite every item. New searches run at once.
		const affects = REPLACE_KEYS.some((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
		const replaced = affects ? await this.placeAll() : 0;
		const searchesChanged = ['searches', 'searchScope', 'excludedTeams'].some(
			(k) => JSON.stringify(old[k as keyof Settings]) !== JSON.stringify(next[k as keyof Settings])
		);
		if (searchesChanged) {
			const who = await this.who();
			if (who) this.ctx.waitUntil(this.runSearches(who, true).then(() => undefined));
		}
		return { settings: next, replaced };
	}

	/** Place every stored item again, after a change to the rules or the turn settings. */
	private async placeAll(): Promise<number> {
		const who = await this.who();
		if (!who) return 0;
		const rows = this.items('1');
		const out = await this.upsertItems(
			who,
			rows.map((r) => ({
				key: r.key,
				repo: r.repo,
				number: r.number,
				subjectType: r.subject_type,
				title: r.title,
				url: r.url,
				create: false
			})),
			{ quiet: true, userAction: true }
		);
		return out.wrote;
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
						url: `${origin}/turn`,
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
			key: string | null;
			repo: string;
			ititle: string;
			iurl: string;
			state: string;
			lane: string;
			override: string | null;
			snoozed_until: number | null;
			finished_note: string | null;
		}>(
			`SELECT a.id, a.sent_at, a.title, a.body, a.url, i.key, i.repo, i.title AS ititle,
         i.url AS iurl, i.state, i.lane, i.override, i.snoozed_until, i.finished_note
       FROM alerts a LEFT JOIN items i ON i.key = a.item_key
       ORDER BY a.sent_at DESC, a.id DESC LIMIT 100`
		);
		const now = Date.now();
		const state = (r: (typeof rows)[number]) =>
			r.state === 'done'
				? 'Done'
				: r.state === 'muted'
					? 'Muted'
					: r.state === 'snoozed' && (r.snoozed_until ?? 0) > now
						? 'Snoozed'
						: laneOf({ lane: r.lane, override: r.override }) !== 'turn'
							? (r.finished_note ?? 'No longer your turn')
							: null;
		return rows.map((r) => ({
			id: r.id,
			sentAt: r.sent_at,
			title: r.title,
			body: r.body,
			url: r.url,
			item: r.key
				? {
						key: r.key,
						repo: r.repo,
						number: subjectRefOf(r.key)?.number ?? null,
						title: r.ititle,
						url: r.iurl,
						state: state(r)
					}
				: null
		}));
	}
}
