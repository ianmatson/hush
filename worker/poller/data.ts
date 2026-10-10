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
import { parseCategoryFeed, parseViewFeed } from '../../src/lib/shared/views';
import { itemFeedEntry, type FeedEntry } from '../feed-entries';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import { mergeSettings, validateSettings } from '../../src/lib/shared/settings-schema';
import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import type {
	AlertDTO,
	Change,
	DashItem,
	DashKind,
	DashResponse,
	Settings
} from '../../src/lib/shared/types';
import { sendPush, vapidFromEnv } from '../webpush';
import { PollerDashboard } from './dashboard';
import { FILL_MAX, MIN, type PollStatus } from './shared';
import { DECISION_FILL_KEY } from './decisions';
import { allCategories, pinsAfter, type CategoryPin } from '../../src/lib/shared/categories';

const DECISION_FILL_DELAY_MS = 2_000;
const PLACEMENT_KEYS = ['categoryGroups', 'views'] as const;

/** A request the Durable Object refused; the route answers with this status. */
export type Refusal = { error: string; status: 400 | 404 | 500 };

const MAX_DEVICES = 10;
const FEED_ENTRIES = 50;
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

	/** For /api/me: your settings and the poll status, in one call. Hush is open: a visit. */
	async me(origin: string): Promise<{ settings: Settings; status: PollStatus }> {
		const seen = (await this.ctx.storage.get<number>('lastActive')) ?? 0;
		if (Date.now() - seen >= SEEN_EVERY) this.ctx.waitUntil(this.touch(origin));
		const [settings, status] = await Promise.all([this.settings(), this.status()]);
		return { settings, status };
	}

	/** Your GitHub login; the routes call only after the session check, so the account exists. */
	private async login(): Promise<string> {
		const user = await this.account();
		if (!user) throw new Error('Not signed in.');
		return user.login;
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
		this.clearPushMarks(writes.map((w) => w.key));
		this.broadcast({ type: 'dash', kind: 'pr' });
		this.broadcast({ type: 'dash', kind: 'issue' });
		return { ok: true };
	}

	/**
	 * An Atom feed (see worker/feeds.ts): the open PRs and issues of a view or a category, newest
	 * first. Null when the view or category is gone.
	 */
	async feedEntries(view: string): Promise<{ name: string; entries: FeedEntry[] } | null> {
		const categoryId = parseCategoryFeed(view);
		if (categoryId) return this.categoryFeed(categoryId);
		const viewId = parseViewFeed(view);
		return viewId ? this.viewFeed(viewId) : null;
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

	/**
	 * Save a settings patch. With `replace`, the patch is all your changes (settings.json, an
	 * imported file): every setting it does not have goes back to its default.
	 */
	async updateSettings(
		body: Partial<Settings>,
		replace = false
	): Promise<Refusal | { settings: Settings }> {
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
		return { settings: next };
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
		const itemKeys = (await this.cachedItemKeys()).slice(0, FILL_MAX);
		await this.decideSubjects(who, [...this.storedSubjectFacts(itemKeys).values()]);
		await this.rePlaceCachedItems(who);
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
						url: `${origin}/`,
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
			item_key: string | null;
			kind: string | null;
		}>(
			`SELECT a.id, a.sent_at, a.title, a.body, a.url, a.item_key, json_extract(s.facts, '$.kind') AS kind
       FROM alerts a LEFT JOIN subjects s ON s.key = a.item_key
       ORDER BY a.sent_at DESC, a.id DESC LIMIT 100`
		);
		return rows.map((r) => {
			const m = r.item_key?.match(/^(.+)#(\d+)$/);
			const kind = r.kind === 'pr' || r.kind === 'issue' ? r.kind : null;
			return {
				id: r.id,
				sentAt: r.sent_at,
				title: r.title,
				body: r.body,
				url: r.url,
				item: m && kind ? { repo: m[1], number: Number(m[2]), kind } : null
			};
		});
	}

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

	async unsnoozeItems(ids: string[]): Promise<{ ok: true }> {
		this.transaction(() => {
			for (const id of ids) this.run('DELETE FROM dash_snoozed WHERE item_id = ?', id);
		});
		return { ok: true };
	}

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
}
