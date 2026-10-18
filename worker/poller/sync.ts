import type { DashKind } from '../../src/lib/shared/types';
import { subjectKey } from '../../src/lib/shared/subject';
import type { FactEvent } from '../../src/lib/shared/push-facts';
import { MUTED_AT } from '../../src/lib/shared/item-snooze';
import { DAY_MS } from '../../src/lib/shared/durations';
import {
	fetchSubjects,
	subjectNumber,
	type GhNotification,
	type SubjectReads,
	type SubjectRef
} from '../github';
import {
	DASH_TTL,
	IN_KEYS,
	NOTIFICATION_KEEP,
	TRACKED_KEEP,
	TRACKED_REBUILD_GAP,
	VIEW_SEARCHES_PREFIX,
	viewSearchesKey,
	type Who
} from './shared';
import { PollerSubjects } from './subjects';

const TEAM_MENTION = 'team_mention';
const MENTION_REASONS = new Set(['mention', TEAM_MENTION]);
const PENDING_NOTIFICATIONS_KEY = 'pendingNotifications';
const NOTIFICATION_READ_ATTEMPTS = 3;
const UNANSWERED_READ_ATTEMPTS = 36;
const DASH_KINDS: DashKind[] = ['pr', 'issue'];
const STORAGE_DELETE_MAX_KEYS = 128;

type NotificationRef = Pick<GhNotification, 'id' | 'unread' | 'reason' | 'updated_at'> & {
	subject: Pick<GhNotification['subject'], 'type' | 'url'>;
	repository: Pick<GhNotification['repository'], 'full_name' | 'name'> & {
		owner: { login: string };
	};
};

function notificationRef(notification: GhNotification): NotificationRef {
	const { id, unread, reason, updated_at, subject, repository } = notification;
	return {
		id,
		unread,
		reason,
		updated_at,
		subject: { type: subject.type, url: subject.url },
		repository: {
			full_name: repository.full_name,
			name: repository.name,
			owner: { login: repository.owner.login }
		}
	};
}

interface PendingNotification {
	notification: NotificationRef;
	attempts: number;
	quiet: boolean;
}

function readIsSettled(entry: PendingNotification, reads: SubjectReads): boolean {
	const id = entry.notification.id;
	if (reads.subjects.has(id) || reads.deletedOrNoAccess.has(id)) return true;
	const attemptsAllowed = reads.githubDidNotAnswer.has(id)
		? UNANSWERED_READ_ATTEMPTS
		: NOTIFICATION_READ_ATTEMPTS;
	return entry.attempts >= attemptsAllowed;
}

const TRACKED_BUILD_KEY = (kind: DashKind) => `trackedBuild:${kind}`;
const TRACKED_REBUILD_KEY = 'trackedRebuildAt';

export interface TrackedBuild {
	at: number;
	complete: boolean;
}

function itemKeyOf(n: NotificationRef): string | null {
	const num = subjectNumber(n);
	return num ? subjectKey(n.repository.full_name, num) : null;
}

const kindOf = (n: NotificationRef): DashKind =>
	n.subject.type === 'PullRequest' ? 'pr' : 'issue';

export abstract class PollerSync extends PollerSubjects {
	protected abstract rebuildTracked(kind: DashKind): Promise<void>;

	protected async trackedBuild(kind: DashKind): Promise<TrackedBuild | null> {
		return (await this.ctx.storage.get<TrackedBuild>(TRACKED_BUILD_KEY(kind))) ?? null;
	}

	protected async storeTrackedBuild(kind: DashKind, complete: boolean) {
		await this.ctx.storage.put(TRACKED_BUILD_KEY(kind), { at: Date.now(), complete });
	}

	private async onlyTracked(items: NotificationRef[]): Promise<NotificationRef[]> {
		const work = items.filter((n) => itemKeyOf(n));
		if (!work.length) return [];
		const keys = work.map((n) => itemKeyOf(n)!);
		let known = this.trackedItemKeys(keys);
		const unknown = work.filter((n) => !known.has(itemKeyOf(n)!));
		if (unknown.length && (await this.rebuildFor(unknown))) known = this.trackedItemKeys(keys);
		return work.filter((n) => known.has(itemKeyOf(n)!));
	}

	private async rebuildFor(unknown: NotificationRef[]): Promise<boolean> {
		const last = (await this.ctx.storage.get<number>(TRACKED_REBUILD_KEY)) ?? 0;
		if (Date.now() - last < TRACKED_REBUILD_GAP) return false;
		const kinds: DashKind[] = [];
		for (const kind of ['pr', 'issue'] as const) {
			const builtAt = (await this.trackedBuild(kind))?.at ?? 0;
			const newer = unknown.some((n) => kindOf(n) === kind && Date.parse(n.updated_at) > builtAt);
			if (newer) kinds.push(kind);
		}
		if (!kinds.length) return false;
		await this.ctx.storage.put(TRACKED_REBUILD_KEY, Date.now());
		for (const kind of kinds)
			await this.rebuildTracked(kind).catch((err) =>
				console.error('views rebuild', (err as Error).message)
			);
		return true;
	}

	protected async keepTrackedFresh() {
		for (const kind of ['pr', 'issue'] as const) {
			const built = await this.trackedBuild(kind);
			if (built && Date.now() - built.at < DASH_TTL) continue;
			await this.rebuildTracked(kind).catch((err) =>
				console.error('views rebuild', (err as Error).message)
			);
		}
	}

	protected untrackMissing(kind: DashKind, found: string[]) {
		const keep = new Set(found);
		const gone = this.all<{ key: string }>(`SELECT key FROM tracked_items WHERE kind = ?`, kind)
			.map((r) => r.key)
			.filter((k) => !keep.has(k));
		if (!gone.length) return;
		this.transaction(() => {
			for (const k of gone) this.run(`DELETE FROM tracked_items WHERE key = ?`, k);
		});
	}

	private newNotifications(items: GhNotification[]): GhNotification[] {
		const known = new Map(
			this.allIn<{ id: string; updated_at: string }>(
				`SELECT id, updated_at FROM notifications WHERE id ${IN_KEYS}`,
				items.map((n) => n.id)
			).map((r) => [r.id, r.updated_at])
		);
		return items.filter((n) => known.get(n.id) !== n.updated_at);
	}

	private rememberNotifications(items: NotificationRef[]) {
		const now = Date.now();
		this.transaction(() => {
			for (const n of items)
				this.run(
					`INSERT INTO notifications (id, updated_at, seen_at) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, seen_at = excluded.seen_at`,
					n.id,
					n.updated_at,
					now
				);
		});
	}

	protected async ingest(who: Who, items: GhNotification[], initialized: boolean): Promise<void> {
		const pending = new Map(
			((await this.ctx.storage.get<PendingNotification[]>(PENDING_NOTIFICATIONS_KEY)) ?? []).map(
				(entry) => [entry.notification.id, entry]
			)
		);
		for (const notification of this.newNotifications(items)) {
			if (!itemKeyOf(notification)) continue;
			if (pending.get(notification.id)?.notification.updated_at === notification.updated_at)
				continue;
			pending.set(notification.id, {
				notification: notificationRef(notification),
				attempts: 0,
				quiet: !initialized
			});
		}
		if (!pending.size) return;
		for (const entry of pending.values()) entry.attempts++;
		await this.ctx.storage.put(PENDING_NOTIFICATIONS_KEY, [...pending.values()]);
		const changed = await this.onlyTracked(
			[...pending.values()].map((entry) => entry.notification)
		);
		const refs: SubjectRef[] = changed.map((n) => ({
			key: n.id,
			owner: n.repository.owner.login,
			repo: n.repository.name,
			number: subjectNumber(n)!
		}));
		const reads = await fetchSubjects(who.token, refs, who.me);
		const fetched = reads.subjects;
		for (const quiet of [true, false]) {
			const notifications = changed.filter(
				(n) => fetched.has(n.id) && pending.get(n.id)!.quiet === quiet
			);
			if (!notifications.length) continue;
			const mentions = new Map<string, FactEvent>();
			if (!quiet)
				for (const n of notifications)
					if (n.unread && MENTION_REASONS.has(n.reason))
						mentions.set(itemKeyOf(n)!, {
							fact: 'mentioned',
							title: n.reason === TEAM_MENTION ? 'Your team was mentioned' : 'You were mentioned'
						});
			await this.record(
				who,
				notifications.map((n) => fetched.get(n.id)!),
				{ quiet, mentions }
			);
		}
		const handled = [...pending.values()]
			.filter((entry) => readIsSettled(entry, reads))
			.map((entry) => entry.notification);
		this.rememberNotifications(handled);
		for (const n of handled) pending.delete(n.id);
		await this.ctx.storage.put(PENDING_NOTIFICATIONS_KEY, [...pending.values()]);
	}

	protected async cleanup() {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < DAY_MS) return;
		const builds = await Promise.all((['pr', 'issue'] as const).map((k) => this.trackedBuild(k)));
		if (builds.every((b) => b?.complete && Date.now() - b.at < DAY_MS))
			this.run(`DELETE FROM tracked_items WHERE seen_at < ?`, Date.now() - TRACKED_KEEP);
		const cutoff = Date.now() - 30 * DAY_MS;
		this.run(
			`DELETE FROM subjects WHERE changed_at < ? AND key NOT IN (SELECT key FROM tracked_items)`,
			cutoff
		);
		this.run(`DELETE FROM decisions WHERE key NOT IN (SELECT key FROM subjects)`);
		this.run(`DELETE FROM notifications WHERE seen_at < ?`, Date.now() - NOTIFICATION_KEEP);
		this.forgetOldPushMarks(Date.now());
		this.forgetMarksOfUnknownItems();
		await this.forgetDeletedViews();
		await this.ctx.storage.put('lastCleanup', Date.now());
	}

	private forgetMarksOfUnknownItems() {
		const knownItems = 'SELECT key FROM subjects UNION SELECT key FROM tracked_items';
		this.run(`DELETE FROM seen WHERE key NOT IN (${knownItems})`);
		this.run(
			`DELETE FROM dash_snoozed WHERE item_id NOT IN (${knownItems})
       AND updated_at != ? AND (snoozed_until IS NULL OR snoozed_until < ?)`,
			MUTED_AT,
			Date.now()
		);
		this.run(`DELETE FROM view_items WHERE item_id NOT IN (${knownItems})`);
	}

	private async forgetDeletedViews() {
		const views = (await this.settings()).views;
		this.run(
			`DELETE FROM view_items WHERE view_id NOT ${IN_KEYS}`,
			JSON.stringify(views.map((v) => v.id))
		);
		const liveKeys = new Set(
			views.flatMap((v) => DASH_KINDS.map((kind) => viewSearchesKey(v.id, kind)))
		);
		const remembered = await this.ctx.storage.list({ prefix: VIEW_SEARCHES_PREFIX });
		const stale = [...remembered.keys()].filter((key) => !liveKeys.has(key));
		for (let i = 0; i < stale.length; i += STORAGE_DELETE_MAX_KEYS)
			await this.ctx.storage.delete(stale.slice(i, i + STORAGE_DELETE_MAX_KEYS));
	}
}
