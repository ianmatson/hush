import { classify, globToRegExp, withOverride } from '../../src/lib/shared/classify';
import { MENUS_VERSION } from '../../src/lib/shared/menus';
import { changesSince, snapshotOf, type Snapshot } from '../../src/lib/shared/changes';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import {
	eventSnoozeDeadline,
	isUnread,
	markState,
	MUTED_AT,
	type SnoozeChoice
} from '../../src/lib/shared/item-snooze';
import { FEED_TABS, parseCategoryFeed, parseViewFeed } from '../../src/lib/shared/views';
import { itemFeedEntry, threadFeedEntry, type FeedEntry } from '../feed-entries';
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
	Settings,
	ThreadDTO,
	View
} from '../../src/lib/shared/types';
import { userToken } from '../db';
import { markThreadDone, markThreadRead, muteThread } from '../github';
import { sendPush, vapidFromEnv } from '../webpush';
import { PollerDashboard } from './dashboard';
import {
	enrichmentFor,
	factsFromRow,
	factsOf,
	subjectRefOf,
	toDTO,
	viewWhere,
	type ThreadRow,
	type ThreadWithFacts
} from './schema';
import { FILL_DONE_WITHIN_MS, FILL_MAX, MIN, MUTED_BY_USER, type PollStatus } from './shared';
import { DECISION_FILL_KEY } from './decisions';
import { allCategories, pinsAfter, type CategoryPin } from '../../src/lib/shared/categories';

const DECISION_FILL_DELAY_MS = 2_000;
const PLACEMENT_KEYS = ['categoryGroups', 'views'] as const;

/** A request the Durable Object refused; the route answers with this status. */
export type Refusal = { error: string; status: 400 | 404 | 500 };

export type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';
const ACTIONS_THAT_SEE_THE_ITEM = new Set<ThreadAction>(['done', 'read', 'snooze', 'mute']);
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
export type NotNeededAnswer = 'others-reviewed' | 'new-commits' | 'team' | 'bots' | 'once';
const NOT_NEEDED = new Set<NotNeededAnswer>([
	'others-reviewed',
	'new-commits',
	'team',
	'bots',
	'once'
]);
const MAX_DEVICES = 10;
const FEED_ENTRIES = 50;
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
	abstract status(): Promise<PollStatus>;

	async alertChannelsChanged(): Promise<void> {
		await this.updateHasAlertChannel();
	}

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
	 * What Hush found, for the first-run card: the counts, and what it finished by itself.
	 */
	async summary(): Promise<{ counts: Counts; notifications: number; done: number }> {
		const notifications = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM threads')?.n ?? 0;
		const done =
			this.one<{ n: number }>(`SELECT COUNT(*) AS n FROM threads WHERE triage = 'done'`)?.n ?? 0;
		return { counts: this.counts(), notifications, done };
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

	/** Unread again: Hush forgets your last look at these PRs or issues ("owner/repo#123"). */
	async markUnseen(keys: string[]): Promise<{ ok: true }> {
		keys = [...new Set(keys.filter((k) => typeof k === 'string' && k.includes('#')))].slice(0, 50);
		if (keys.length)
			this.run(
				`DELETE FROM seen WHERE key IN (SELECT value FROM json_each(?))`,
				JSON.stringify(keys)
			);
		return { ok: true };
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

		// Mute is about the whole PR or issue: it also mutes it on the dashboards (and Unmute shows
		// it again). Done is about one event only: the PR or issue stays on its dashboard.
		const keys = [...new Set(threads.flatMap((t) => (t.subject_key ? [t.subject_key] : [])))];
		if (action === 'mute') this.markDashboards(keys, true);
		if (action === 'unmute') this.markDashboards(keys, false);
		if (ACTIONS_THAT_SEE_THE_ITEM.has(action))
			this.clearPushMarks(this.itemKeysOf(threads.map((t) => t.id)));

		if (action === 'done' || action === 'read' || action === 'mute')
			await this.mirrorOnGitHub(
				action,
				threads.map((t) => t.id)
			);
		return { ok: true, updated: threads.length, counts: this.counts() };
	}

	/**
	 * An Atom feed (see worker/feeds.ts): an inbox tab's threads, or the open PRs and issues of a
	 * view or a category, newest first. Null when the view or category is gone.
	 */
	async feedEntries(view: string): Promise<{ name: string; entries: FeedEntry[] } | null> {
		const categoryId = parseCategoryFeed(view);
		if (categoryId) return this.categoryFeed(categoryId);
		const viewId = parseViewFeed(view);
		if (viewId) return this.viewFeed(viewId);
		const tab = FEED_TABS.find((t) => t.id === view);
		if (!tab) return null;
		const { where, args } = viewWhere(view);
		const rows = this.threads(
			`${where} ORDER BY gh_updated_at DESC LIMIT ${FEED_ENTRIES}`,
			...args
		);
		return { name: tab.label, entries: rows.map(threadFeedEntry) };
	}

	private async categoryFeed(id: string): Promise<{ name: string; entries: FeedEntry[] } | null> {
		const settings = await this.settings();
		const category = allCategories(settings.categoryGroups).find((c) => c.id === id);
		if (!category) return null;
		return {
			name: category.name,
			entries: await this.itemFeed((i) => !!i.categories?.includes(id))
		};
	}

	private async viewFeed(id: string): Promise<{ name: string; entries: FeedEntry[] } | null> {
		const found = (await this.settings()).views.find((v) => v.id === id);
		if (!found) return null;
		return { name: found.name, entries: await this.itemFeed((i) => i.sections.includes(id)) };
	}

	private async itemFeed(keep: (i: DashItem) => boolean): Promise<FeedEntry[]> {
		const items: DashItem[] = [];
		for (const kind of ['pr', 'issue'] as const) {
			const cached = await this.ctx.storage.get<{ data: DashResponse }>(`dash:${kind}`);
			items.push(...(cached?.data.items ?? []));
		}
		return items
			.filter((i) => !i.dismissed && keep(i))
			.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
			.slice(0, FEED_ENTRIES)
			.map(itemFeedEntry);
	}

	// --- Settings -------------------------------------------------------------------------

	/** Team slugs whose review requests count in the inbox (Settings → Inbox). */
	private async inboxTeamsFor(settings: Settings): Promise<string[]> {
		return settings.teamReviewsAreAction ? (await this.teams()).teams.map((t) => t.slug) : [];
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
		if (JSON.stringify(old.alertChannels) !== JSON.stringify(next.alertChannels))
			await this.updateHasAlertChannel();
		if (old.smartDecisions && !next.smartDecisions) this.forgetDecisions();
		if (!old.smartDecisions && this.decisionsOn(next)) await this.startDecisionFill();
		// Only these settings change how threads are sorted; the rest (menus, dashboards, push)
		// must not rewrite every thread.
		const placementChanged = PLACEMENT_KEYS.some(
			(k) => JSON.stringify(old[k]) !== JSON.stringify(next[k])
		);
		if (placementChanged) {
			const who = await this.who();
			if (who) await this.rePlaceCachedItems(who);
		}
		const groupsChanged =
			JSON.stringify(old.categoryGroups) !== JSON.stringify(next.categoryGroups);
		if (groupsChanged && this.decisionsOn(next)) await this.startDecisionFill();
		const affects =
			placementChanged ||
			RECLASSIFY_KEYS.some((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
		const reclassified = affects ? await this.reclassify(next) : 0;
		return { settings: next, reclassified };
	}

	async pinItems(ids: string[], pin: CategoryPin): Promise<Refusal | { ok: true }> {
		const groups = (await this.settings()).categoryGroups;
		const pins = this.itemPins(ids);
		const next = new Map<string, string[]>();
		for (const id of ids) {
			const pinned = pinsAfter(pins.get(id) ?? [], pin, groups);
			if (!pinned) return { error: 'Unknown category', status: 400 };
			next.set(id, pinned);
		}
		this.transaction(() => {
			for (const [id, pinned] of next) {
				if (!pinned.length) {
					this.run('DELETE FROM item_pins WHERE key = ?', id);
					continue;
				}
				this.run(
					`INSERT INTO item_pins (key, pinned) VALUES (?, ?)
           ON CONFLICT (key) DO UPDATE SET pinned = excluded.pinned`,
					id,
					JSON.stringify(pinned)
				);
			}
		});
		const who = await this.who();
		if (who) await this.rePlaceCachedItems(who);
		return { ok: true };
	}

	async reevaluateItems(): Promise<{ items: number }> {
		const keys = (await this.cachedItemKeys()).slice(0, FILL_MAX);
		this.forgetIdentityAnswersOf(keys);
		await this.startDecisionFill();
		return { items: keys.length };
	}

	private async startDecisionFill(): Promise<void> {
		await this.ctx.storage.put(DECISION_FILL_KEY, Date.now());
		const alarm = await this.ctx.storage.getAlarm();
		const soon = Date.now() + DECISION_FILL_DELAY_MS;
		if (alarm === null || alarm > soon) await this.ctx.storage.setAlarm(soon);
	}

	protected async decisionFillPending(): Promise<boolean> {
		return !!(await this.ctx.storage.get(DECISION_FILL_KEY));
	}

	protected async fillDecisions(): Promise<void> {
		if (!(await this.decisionFillPending())) return;
		await this.ctx.storage.delete(DECISION_FILL_KEY);
		const who = await this.who();
		if (!who || !this.decisionsOn(who.settings)) return;
		const doneSince = new Date(Date.now() - FILL_DONE_WITHIN_MS).toISOString();
		const rows = this.threads(
			`subject_key IS NOT NULL AND category != 'muted'
       AND (triage IN ('inbox', 'snoozed') OR gh_updated_at > ?)
       ORDER BY gh_updated_at DESC LIMIT ${FILL_MAX}`,
			doneSince
		);
		const threadSubjects = [
			...new Map(
				rows.flatMap((r) => {
					const f = factsOf(r);
					return f && r.subject_key ? [[r.subject_key, f] as const] : [];
				})
			).values()
		];
		await this.decideSubjects(who, threadSubjects);
		const itemKeys = (await this.cachedItemKeys()).slice(0, FILL_MAX);
		await this.decideSubjects(who, [...this.storedSubjectFacts(itemKeys).values()]);
		await this.rePlaceCachedItems(who);
		await this.reclassify(who.settings);
	}

	/**
	 * Re-run the classifier on stored threads after the settings change.
	 */
	private async reclassify(settings: Settings): Promise<number> {
		const me = await this.login();
		const myTeams = await this.inboxTeamsFor(settings);
		const changes: (() => void)[] = [];
		for (const r of this.threads('1')) {
			if (r.rule === MUTED_BY_USER) continue;
			const c = withOverride(classify(factsFromRow(r, me, myTeams), settings), r, r.gh_updated_at);
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
		await this.updateHasAlertChannel();
		return { ok: true };
	}

	async unsubscribe(endpoint: string): Promise<{ ok: true }> {
		this.run('DELETE FROM push_devices WHERE endpoint = ?', endpoint);
		await this.updateHasAlertChannel();
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
						id: r.tid,
						repo: r.repo,
						number: subjectRefOf({ id: r.tid, subject_key: r.subject_key })?.number ?? null,
						title: r.ttitle,
						htmlUrl: r.html_url,
						state: state(r)
					}
				: null
		}));
	}

	// --- Dashboard marks: snoozed and muted ------------------------------------------------

	/** A dashboard with your snoozes, mutes, and unread marks applied. */
	async dashboardView(kind: DashKind, force: boolean): Promise<DashResponse> {
		const data = await this.dashboard(kind, force);
		const me = await this.login();
		const marks = new Map(
			this.all<{
				item_id: string;
				updated_at: string;
				snoozed_until: number | null;
				snooze_event: SnoozeEvent | null;
				snoozed_at: number | null;
			}>('SELECT * FROM dash_snoozed').map((m) => [
				m.item_id,
				{
					updatedAt: m.updated_at,
					snoozedUntil: m.snoozed_until,
					snoozeEvent: m.snooze_event,
					snoozedAt: m.snoozed_at
				}
			])
		);
		const subjects = this.all<{ key: string; facts: string }>(
			`SELECT key, facts FROM subjects WHERE key IN (SELECT value FROM json_each(?))`,
			JSON.stringify(data.items.map((i) => i.id))
		);
		const factsOf = new Map(subjects.map((s) => [s.key, JSON.parse(s.facts) as SubjectFacts]));
		const since = this.sinceYouLooked(subjects, me);
		const now = Date.now();
		for (const i of data.items) {
			const state = markState(marks.get(i.id), i.updatedAt, factsOf.get(i.id), me, now);
			i.dismissed = state.kind !== 'none';
			i.muted = state.kind === 'muted';
			i.snooze = state.kind === 'snoozed' ? state.snooze : undefined;
			const s = since.get(i.id);
			i.changes = s?.changes ?? [];
			i.seenAt = s?.seenAt ?? null;
			i.unread = isUnread(i.seenAt, i.changes);
		}
		return data;
	}

	/**
	 * "Doesn't need me": Hush was wrong about a thread (its id). Each answer changes what would
	 * have been right: a setting; or only this PR or issue, until it changes ("once": FYI in the
	 * inbox). Returns how to undo it.
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
				: answer === 'new-commits'
					? { newCommitsAfterReview: 'never' }
					: answer === 'team'
						? { teamReviewsAreAction: false }
						: { botsAreFyi: true };
		const undo = Object.fromEntries(
			Object.keys(patch).map((k) => [k, old[k as keyof Settings]])
		) as Partial<Settings>;
		const r = await this.updateSettings(patch);
		if ('error' in r) return r;
		return { settings: r.settings, undo: { settings: undo } };
	}

	/**
	 * "Only this one": the PR or issue's threads are FYI until they change. `on: false` undoes it.
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
		return { ok: true };
	}

	/** Snooze until new activity, until a time, or until something happens (see markState). */
	async snoozeItems(items: ItemRef[], choice: SnoozeChoice): Promise<{ ok: true }> {
		const now = Date.now();
		const until = choice.event ? eventSnoozeDeadline(now) : (choice.until ?? null);
		this.transaction(() => {
			for (const i of items)
				this.run(
					`INSERT INTO dash_snoozed (item_id, updated_at, snoozed_until, snooze_event, snoozed_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at,
             snoozed_until = excluded.snoozed_until, snooze_event = excluded.snooze_event,
             snoozed_at = excluded.snoozed_at`,
					i.id,
					i.updatedAt,
					until,
					choice.event ?? null,
					now
				);
		});
		return { ok: true };
	}

	/** Back in the list: ends a snooze or a mute. */
	async unsnoozeItems(ids: string[]): Promise<{ ok: true }> {
		this.transaction(() => {
			for (const id of ids) this.run('DELETE FROM dash_snoozed WHERE item_id = ?', id);
		});
		return { ok: true };
	}

	/** Mute: out of the list until you unmute it. Only in Hush: GitHub does not change. */
	async muteItems(ids: string[]): Promise<{ ok: true }> {
		this.transaction(() => {
			for (const id of ids)
				this.run(
					`INSERT INTO dash_snoozed (item_id, updated_at) VALUES (?, ?)
           ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at,
             snoozed_until = NULL, snooze_event = NULL, snoozed_at = NULL`,
					id,
					MUTED_AT
				);
		});
		return { ok: true };
	}

	/**
	 * The dashboards' side of Mute in the inbox: hidden until you unmute it, or shown again.
	 * Unmute clears only a mute (not a "hide until it changes"). Open dashboards refresh (from the
	 * cache: no GitHub requests).
	 */
	private markDashboards(keys: string[], muted: boolean) {
		if (!keys.length) return;
		this.transaction(() => {
			for (const key of keys)
				if (muted)
					this.run(
						`INSERT INTO dash_snoozed (item_id, updated_at) VALUES (?, ?)
             ON CONFLICT (item_id) DO UPDATE SET updated_at = excluded.updated_at,
               snoozed_until = NULL, snooze_event = NULL, snoozed_at = NULL`,
						key,
						MUTED_AT
					);
				else
					this.run('DELETE FROM dash_snoozed WHERE item_id = ? AND updated_at = ?', key, MUTED_AT);
		});
		this.broadcast({ type: 'dash', kind: 'pr' });
		this.broadcast({ type: 'dash', kind: 'issue' });
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
