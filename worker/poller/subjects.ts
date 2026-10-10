import { placeItem } from '../../src/lib/shared/categories';
import { finishItem, keepItem, sortItems } from '../../src/lib/shared/dashboard';
import type { DashItem, DashResponse, RuleFacts } from '../../src/lib/shared/types';
import {
	dashFactsOf,
	enrichmentOf,
	subjectKey,
	type SubjectFacts
} from '../../src/lib/shared/subject';
import type { SubjectDecisions } from '../../src/lib/shared/decisions';
import type { ItemMark } from '../../src/lib/shared/item-snooze';
import { itemPush, type FactEvent } from '../../src/lib/shared/push-facts';
import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import { fetchSubjects } from '../github';
import type { PushCandidate } from './alerts';
import { PollerDecisions } from './decisions';
import { TRACKED_SEEN_REFRESH, type Who } from './shared';

/** SQLite binds at most this many values per statement here; longer IN lists go in chunks. */
const CHUNK = 90;
const marks = (n: number) => Array(n).fill('?').join(',');
const parse = (json: string | undefined) => (json ? (JSON.parse(json) as SubjectFacts) : null);
const NEW_SUBJECT_WINDOW_MS = 60 * 60_000;

/**
 * The subject store. Every GitHub read of a PR or issue goes through `record`, which keeps the
 * one copy of its facts, pushes the facts you chose, and updates the cached dashboards.
 */
export abstract class PollerSubjects extends PollerDecisions {
	protected async record(
		who: Who,
		subjects: SubjectFacts[],
		opts: { dash?: boolean; quiet?: boolean; mentions?: Map<string, FactEvent> } = {}
	): Promise<{ changed: number }> {
		const fresh = new Map(subjects.map((x) => [subjectKey(x.repo, x.number), x]));
		const keys = [...fresh.keys()];
		const stored = new Map<string, string>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				stored.set(r.key, r.facts);
		}
		const changed = [...fresh].filter(([k, x]) => stored.get(k) !== JSON.stringify(x));
		const now = Date.now();
		this.transaction(() => {
			for (const [k, x] of changed)
				this.run(
					`INSERT INTO subjects (key, facts, changed_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET facts = excluded.facts, changed_at = excluded.changed_at`,
					k,
					JSON.stringify(x),
					now
				);
		});
		await this.decideSubjects(who, subjects);
		const decided = this.decisionsOf(who, subjects);
		if (!opts.quiet) {
			const mentions = opts.mentions ?? new Map<string, FactEvent>();
			const pushable = [...fresh].filter(
				([k]) => mentions.has(k) || changed.some(([c]) => c === k)
			);
			await this.pushFactsOf(who, pushable, stored, decided, mentions);
		}
		if (opts.dash !== false)
			await this.patchDashCaches(
				who,
				changed.map(([, x]) => x),
				decided
			);
		return { changed: changed.length };
	}

	private async pushFactsOf(
		who: Who,
		changed: [string, SubjectFacts][],
		stored: Map<string, string>,
		decided: Map<string, SubjectDecisions>,
		mentions: Map<string, FactEvent>
	) {
		const wanted = new Set(who.settings.pushFacts);
		if (!wanted.size || !changed.length) return;
		if (!(await this.ctx.storage.get<boolean>('initialized'))) return;
		const myTeams = new Set((await this.teams()).teams.map((t) => t.slug));
		const keys = changed.map(([k]) => k);
		const marksOf = new Map<string, ItemMark>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const m of this.all<{
				item_id: string;
				updated_at: string;
				snoozed_until: number | null;
				snooze_event: SnoozeEvent | null;
				snoozed_at: number | null;
			}>(`SELECT * FROM dash_snoozed WHERE item_id IN (${marks(chunk.length)})`, ...chunk))
				marksOf.set(m.item_id, {
					updatedAt: m.updated_at,
					snoozedUntil: m.snoozed_until,
					snoozeEvent: m.snooze_event,
					snoozedAt: m.snoozed_at
				});
		}
		const now = Date.now();
		const candidates: PushCandidate[] = changed.flatMap(([key, after]) => {
			const push = itemPush(
				parse(stored.get(key)),
				after,
				marksOf.get(key),
				wanted,
				who.me,
				myTeams,
				now - NEW_SUBJECT_WINDOW_MS,
				now,
				mentions.has(key) ? [mentions.get(key)!] : []
			);
			if (!push) return [];
			return [
				{
					itemKey: key,
					reason: push.reason,
					ignoresRepeatSetting: push.reason === 'snooze-over',
					urgent: !!decided.get(key)?.urgent,
					message: { title: push.title, body: `${after.title}\n${after.repo}`, url: after.url }
				}
			];
		});
		await this.deliver(candidates);
	}

	/** Replace changed subjects in the cached dashboards (and drop the ones that closed). */
	protected async patchDashCaches(
		who: Who,
		subs: SubjectFacts[],
		decided: Map<string, SubjectDecisions> = new Map()
	) {
		if (!subs.length) return;
		const { dash } = who.settings;
		let teamSet: Set<string> | null = null;
		for (const kind of ['pr', 'issue'] as const) {
			const key = `dash:${kind}`;
			const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			// Dashboard items use the PR or issue key, the same key as threads (see dashFactsOf).
			const byId = new Map(
				subs.filter((x) => x.kind === kind).map((x) => [subjectKey(x.repo, x.number), x])
			);
			if (!cached || !cached.data.items.some((i) => byId.has(i.id))) continue;
			teamSet ??= new Set((await this.teams()).teams.map((t) => t.slug));
			const names = Object.fromEntries(cached.data.sections.map((x) => [x.id, x.name]));
			const patched = sortItems(
				cached.data.items.flatMap((i) => {
					const sub = byId.get(i.id);
					if (!sub) return [i];
					const f = dashFactsOf(sub, who.me, teamSet!, decided.get(i.id));
					if (f.state !== 'open' || !keepItem(f, who.me, dash)) return [];
					return [
						finishItem(
							f,
							i.sections,
							i.sections.map((x) => names[x] ?? x),
							who.me,
							dash.staleDays,
							Date.now()
						)
					];
				})
			);
			const items = this.placeItems(who, patched, byId);
			this.storeTracked(items);
			const data: DashResponse = {
				...cached.data,
				items,
				sections: cached.data.sections.map((x) => ({
					...x,
					count: items.filter((i) => i.sections.includes(x.id)).length
				}))
			};
			await this.ctx.storage.put(key, { sig: cached.sig, data });
			this.broadcast({ type: 'dash', kind });
		}
	}

	protected storedSubjectFacts(keys: string[]): Map<string, SubjectFacts> {
		const out = new Map<string, SubjectFacts>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				out.set(r.key, JSON.parse(r.facts) as SubjectFacts);
		}
		return out;
	}

	protected itemPins(keys: string[]): Map<string, string[]> {
		const out = new Map<string, string[]>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{ key: string; pinned: string }>(
				`SELECT key, pinned FROM item_pins WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				out.set(r.key, JSON.parse(r.pinned) as string[]);
		}
		return out;
	}

	protected placeItems(
		who: Who,
		items: DashItem[],
		known: Map<string, SubjectFacts> = new Map()
	): DashItem[] {
		if (!items.length) return items;
		const keys = items.map((i) => i.id);
		const facts = new Map(known);
		const missing = keys.filter((k) => !facts.has(k));
		for (const [k, f] of this.storedSubjectFacts(missing)) facts.set(k, f);
		const decided = this.decisionsOf(who, [...facts.values()]);
		const pins = this.itemPins(keys);
		const viewNames = new Map(who.settings.views.map((v) => [v.id, v.name]));
		return items.map((i) => {
			const s = facts.get(i.id);
			if (!s) return { ...i, categories: [], pinnedCategories: [] };
			const d = decided.get(i.id);
			const t: RuleFacts = {
				repo: s.repo,
				subjectType: s.kind === 'pr' ? 'PullRequest' : 'Issue',
				title: s.title,
				enrichment: enrichmentOf(s, who.me, d),
				me: who.me,
				views: i.sections.map((id) => viewNames.get(id) ?? id)
			};
			const placed = placeItem(t, pins.get(i.id), who.settings.categoryGroups);
			return { ...i, categories: placed.categories, pinnedCategories: placed.pinned };
		});
	}

	private trackedSeenAt(keys: string[]): Map<string, number> {
		const out = new Map<string, number>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{ key: string; seen_at: number }>(
				`SELECT key, seen_at FROM tracked_items WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				out.set(r.key, r.seen_at);
		}
		return out;
	}

	protected trackedItemKeys(keys: string[]): Set<string> {
		return new Set(this.trackedSeenAt(keys).keys());
	}

	protected storeTracked(items: DashItem[], seen = false) {
		const now = Date.now();
		const stored = this.trackedSeenAt(items.map((i) => i.id));
		const due = items.filter((i) => {
			const seenAt = stored.get(i.id);
			return seenAt === undefined || (seen && now - seenAt > TRACKED_SEEN_REFRESH);
		});
		if (!due.length) return;
		this.transaction(() => {
			for (const i of due)
				this.run(
					`INSERT INTO tracked_items (key, kind, seen_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET seen_at = excluded.seen_at`,
					i.id,
					i.kind,
					now
				);
		});
	}

	protected async rePlaceCachedItems(who: Who): Promise<void> {
		for (const kind of ['pr', 'issue'] as const) {
			const key = `dash:${kind}`;
			const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			if (!cached) continue;
			const items = this.placeItems(who, cached.data.items);
			this.storeTracked(items);
			await this.ctx.storage.put(key, { sig: cached.sig, data: { ...cached.data, items } });
			this.broadcast({ type: 'dash', kind });
		}
	}

	protected async cachedItemKeys(): Promise<string[]> {
		const keys = new Set<string>();
		for (const kind of ['pr', 'issue'] as const) {
			const cached = await this.ctx.storage.get<{ data: DashResponse }>(`dash:${kind}`);
			for (const i of cached?.data.items ?? []) keys.add(i.id);
		}
		return [...keys];
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Stores its facts,
	 * which updates its entry in the cached dashboards. About 1 point.
	 */
	async recheck(repo: string, number: number): Promise<{ ok: true }> {
		const who = await this.who();
		if (!who) return { ok: true };
		const [owner, name] = repo.split('/');
		const key = subjectKey(repo, number);
		const fetched = await fetchSubjects(who.token, [{ key, owner, repo: name, number }], who.me);
		const sub = fetched.get(key);
		if (sub) await this.record(who, [sub]);
		return { ok: true };
	}

	/**
	 * Facts that the API fetched (the peek): store them and update every view. `changed` tells the
	 * browser to refetch its lists.
	 */
	async recordFetched(sub: SubjectFacts): Promise<{ changed: boolean }> {
		const who = await this.who();
		if (!who) return { changed: false };
		const out = await this.record(who, [sub]);
		return { changed: out.changed > 0 };
	}
}
