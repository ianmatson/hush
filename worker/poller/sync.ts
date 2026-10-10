import type { DashKind } from '../../src/lib/shared/types';
import { subjectKey } from '../../src/lib/shared/subject';
import type { FactEvent } from '../../src/lib/shared/push-facts';
import { fetchSubjects, subjectNumber, type GhNotification, type SubjectRef } from '../github';
import {
	DAY,
	DASH_TTL,
	NOTIFICATION_KEEP,
	TRACKED_KEEP,
	TRACKED_REBUILD_GAP,
	type Who
} from './shared';
import { PollerSubjects } from './subjects';

const marks = (n: number) => Array(n).fill('?').join(',');
const CHUNK = 90;
const TEAM_MENTION = 'team_mention';
const MENTION_REASONS = new Set(['mention', TEAM_MENTION]);

const TRACKED_BUILD_KEY = (kind: DashKind) => `trackedBuild:${kind}`;
const TRACKED_REBUILD_KEY = 'trackedRebuildAt';

export interface TrackedBuild {
	at: number;
	complete: boolean;
}

function itemKeyOf(n: GhNotification): string | null {
	const num = subjectNumber(n);
	return num ? subjectKey(n.repository.full_name, num) : null;
}

const kindOf = (n: GhNotification): DashKind => (n.subject.type === 'PullRequest' ? 'pr' : 'issue');

export abstract class PollerSync extends PollerSubjects {
	protected abstract rebuildTracked(kind: DashKind): Promise<void>;

	protected async trackedBuild(kind: DashKind): Promise<TrackedBuild | null> {
		return (await this.ctx.storage.get<TrackedBuild>(TRACKED_BUILD_KEY(kind))) ?? null;
	}

	protected async storeTrackedBuild(kind: DashKind, complete: boolean) {
		await this.ctx.storage.put(TRACKED_BUILD_KEY(kind), { at: Date.now(), complete });
	}

	private async onlyTracked(items: GhNotification[]): Promise<GhNotification[]> {
		const work = items.filter((n) => itemKeyOf(n));
		if (!work.length) return [];
		const keys = work.map((n) => itemKeyOf(n)!);
		let known = this.trackedItemKeys(keys);
		const unknown = work.filter((n) => !known.has(itemKeyOf(n)!));
		if (unknown.length && (await this.rebuildFor(unknown))) known = this.trackedItemKeys(keys);
		return work.filter((n) => known.has(itemKeyOf(n)!));
	}

	private async rebuildFor(unknown: GhNotification[]): Promise<boolean> {
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
		const known = new Map<string, string>();
		for (let i = 0; i < items.length; i += CHUNK) {
			const ids = items.slice(i, i + CHUNK).map((n) => n.id);
			for (const r of this.all<{ id: string; updated_at: string }>(
				`SELECT id, updated_at FROM notifications WHERE id IN (${marks(ids.length)})`,
				...ids
			))
				known.set(r.id, r.updated_at);
		}
		const fresh = items.filter((n) => known.get(n.id) !== n.updated_at);
		const now = Date.now();
		this.transaction(() => {
			for (const n of fresh)
				this.run(
					`INSERT INTO notifications (id, updated_at, seen_at) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, seen_at = excluded.seen_at`,
					n.id,
					n.updated_at,
					now
				);
		});
		return fresh;
	}

	protected async ingest(who: Who, items: GhNotification[], initialized: boolean): Promise<void> {
		const changed = await this.onlyTracked(this.newNotifications(items));
		if (!changed.length) return;
		const refs: SubjectRef[] = changed.map((n) => ({
			key: n.id,
			owner: n.repository.owner.login,
			repo: n.repository.name,
			number: subjectNumber(n)!
		}));
		const fetched = await fetchSubjects(who.token, refs, who.me);
		const mentions = new Map<string, FactEvent>();
		if (initialized)
			for (const n of changed)
				if (n.unread && MENTION_REASONS.has(n.reason))
					mentions.set(itemKeyOf(n)!, {
						fact: 'mentioned',
						title: n.reason === TEAM_MENTION ? 'Your team was mentioned' : 'You were mentioned'
					});
		await this.record(who, [...fetched.values()], { quiet: !initialized, mentions });
	}

	protected async cleanup() {
		const last = (await this.ctx.storage.get<number>('lastCleanup')) ?? 0;
		if (Date.now() - last < DAY) return;
		const builds = await Promise.all((['pr', 'issue'] as const).map((k) => this.trackedBuild(k)));
		if (builds.every((b) => b?.complete && Date.now() - b.at < DAY))
			this.run(`DELETE FROM tracked_items WHERE seen_at < ?`, Date.now() - TRACKED_KEEP);
		const cutoff = Date.now() - 30 * DAY;
		this.run(
			`DELETE FROM subjects WHERE changed_at < ? AND key NOT IN (SELECT key FROM tracked_items)`,
			cutoff
		);
		this.run(`DELETE FROM decisions WHERE key NOT IN (SELECT key FROM subjects)`);
		this.run(`DELETE FROM notifications WHERE seen_at < ?`, Date.now() - NOTIFICATION_KEEP);
		this.forgetOldPushMarks(Date.now());
		await this.ctx.storage.put('lastCleanup', Date.now());
	}
}
