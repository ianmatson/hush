import { placeItem } from '../../src/lib/shared/categories';
import { HOUR_MS } from '../../src/lib/shared/durations';
import { keptAfterChange, stillKept } from '../../src/lib/shared/closed-items';
import { finishItem, keepItem, sortItems } from '../../src/lib/shared/dashboard';
import type { DashItem, DashResponse } from '../../src/lib/shared/types';
import {
	dashFactsOf,
	subjectKey,
	subjectRuleFacts,
	type SubjectFacts
} from '../../src/lib/shared/subject';
import type { SubjectDecisions } from '../../src/lib/shared/decisions';
import type { ItemMark } from '../../src/lib/shared/item-snooze';
import { itemPush, type FactEvent } from '../../src/lib/shared/push-facts';
import type { SnoozeEvent } from '../../src/lib/shared/snooze';
import { fetchSubjects } from '../github';
import { itemStatuses } from '../projects';
import { readsBoard } from '../../src/lib/shared/projects';
import { sourceItemOf, withProjectStatuses } from './project-status';
import { itemQueryFacts } from '../../src/lib/shared/categories';
import { viewsPassingFilters } from '../../src/lib/shared/item-views';
import type { PushCandidate } from './alerts';
import { PollerDecisions } from './decisions';
import { IN_KEYS, olderThan, TRACKED_SEEN_REFRESH, type Who } from './shared';

const parse = (json: string | undefined) => (json ? (JSON.parse(json) as SubjectFacts) : null);
const NEW_SUBJECT_WINDOW_MS = HOUR_MS;

type SnoozedRow = {
	item_id: string;
	updated_at: string;
	snoozed_until: number | null;
	snooze_event: SnoozeEvent | null;
	snoozed_at: number | null;
};

const markOf = (row: SnoozedRow): ItemMark => ({
	updatedAt: row.updated_at,
	snoozedUntil: row.snoozed_until,
	snoozeEvent: row.snooze_event,
	snoozedAt: row.snoozed_at
});

/**
 * The subject store. Every GitHub read of a PR or issue goes through `record`, which keeps the
 * one copy of its facts, pushes the facts you chose, and updates the cached dashboards.
 */
export abstract class PollerSubjects extends PollerDecisions {
	protected async record(
		who: Who,
		subjects: SubjectFacts[],
		opts: { dash?: boolean; quiet?: boolean; mentions?: Map<string, FactEvent> } = {}
	): Promise<void> {
		const keys = [...new Set(subjects.map((x) => subjectKey(x.repo, x.number)))];
		const stored = new Map(
			this.allIn<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key ${IN_KEYS}`,
				keys
			).map((r) => [r.key, r.facts])
		);
		subjects = subjects.filter(
			(x) => !olderThan(x, parse(stored.get(subjectKey(x.repo, x.number))))
		);
		if (!subjects.length) return;
		const fresh = new Map(subjects.map((x) => [subjectKey(x.repo, x.number), x]));
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
		if (opts.dash !== false) await this.patchDashCaches(who, subjects, decided);
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
		const marksOf = this.itemMarks(changed.map(([k]) => k));
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

	protected async patchDashCaches(
		who: Who,
		subs: SubjectFacts[],
		decided: Map<string, SubjectDecisions> = new Map(),
		refreshProjects = true
	) {
		if (!subs.length) return false;
		const { dash } = who.settings;
		let teamSet: Set<string> | null = null;
		let changed = false;
		for (const kind of ['pr', 'issue'] as const) {
			const key = `dash:${kind}`;
			const initial = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			// Dashboard items use the PR or issue key, the same key as threads (see dashFactsOf).
			const byId = new Map(
				subs.filter((x) => x.kind === kind).map((x) => [subjectKey(x.repo, x.number), x])
			);
			if (!initial || !(initial.data.sourceItems ?? initial.data.items).some((i) => byId.has(i.id)))
				continue;
			const statuses =
				who.projectAccess === 'none'
					? null
					: !refreshProjects
						? { projects: [], statusOf: new Map(), errors: initial.data.projectErrors ?? [] }
						: await itemStatuses(
								who.token,
								(initial.data.sourceItems ?? initial.data.items).flatMap((item) => {
									const sub = byId.get(item.id);
									return sub ? [sub.id] : [];
								})
							);
			if (refreshProjects) teamSet ??= new Set((await this.teams()).teams.map((t) => t.slug));
			const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			if (!cached) continue;
			teamSet ??= new Set(cached.data.teams.map((team) => team.slug));
			const names = Object.fromEntries(cached.data.sections.map((x) => [x.id, x.name]));
			const now = Date.now();
			const patched = sortItems(
				this.restoreSourceItems(who, cached.data).flatMap((i) => {
					const sub = byId.get(i.id);
					if (!sub) return [i];
					const f = dashFactsOf(sub, who.me, teamSet!, decided.get(i.id));
					const visible = cached.data.items.find((item) => item.id === i.id);
					const kept = !!visible && keptAfterChange(visible, f);
					const onBoard = who.settings.views.some(
						(view) => i.sections.includes(view.id) && view.searches.some(readsBoard)
					);
					if ((!keepItem(f, who.me, dash) && !onBoard) || (kept && !stillKept(f, now))) return [];
					const item = finishItem(
						f,
						i.sections,
						i.sections.map((x) => names[x] ?? x),
						who.me,
						dash.staleDays,
						now
					);
					return [
						{
							...item,
							sourceFilters: i.sourceFilters,
							sourceQueries: i.sourceQueries,
							...(kept && { keptAfterClose: true, keptSections: visible!.sections })
						}
					];
				})
			);
			const projectData = withProjectStatuses(patched, (id) => byId.get(id)?.id, statuses, {
				...cached.data,
				items: cached.data.sourceItems ?? cached.data.items
			});
			const sourceItems = this.placeItems(who, projectData.items, byId);
			const projectErrors = refreshProjects
				? (statuses?.errors ?? [])
				: (cached.data.projectErrors ?? []);
			const items = sortItems(
				sourceItems.flatMap((item) => {
					if (item.keptAfterClose)
						return [{ ...item, sections: item.keptSections ?? item.sections }];
					if (!item.sourceFilters) return [item];
					const viewIds = viewsPassingFilters(
						item.sections,
						new Map(
							Object.entries(item.sourceFilters).map(([id, filters]) => [id, new Set(filters)])
						),
						itemQueryFacts(item, who.me, who.settings, now)
					);
					if (!viewIds.size) return [];
					if (viewIds.size === item.sections.length) return [item];
					const passing = item.sections.filter((id) => viewIds.has(id));
					return [
						finishItem(
							item,
							passing,
							passing.map((id) => names[id] ?? id),
							who.me,
							dash.staleDays,
							now
						)
					];
				})
			);
			this.storeTracked(items);
			const data: DashResponse = {
				...cached.data,
				projects: projectData.projects,
				items,
				sourceItems: sourceItems.map(sourceItemOf),
				projectErrors,
				errors: [
					...new Set([
						...cached.data.errors.filter((error) => !cached.data.projectErrors?.includes(error)),
						...projectErrors
					])
				].slice(0, 3),
				sections: cached.data.sections.map((x) => ({
					...x,
					count: items.filter((i) => i.sections.includes(x.id) && !i.keptAfterClose).length
				}))
			};
			if (JSON.stringify(data) === JSON.stringify(cached.data)) continue;
			await this.ctx.storage.put(key, { sig: cached.sig, data });
			this.broadcast({ type: 'dash', kind });
			changed = true;
		}
		return changed;
	}

	private restoreSourceItems(who: Who, data: DashResponse): DashItem[] {
		if (!data.sourceItems) return data.items;
		const facts = this.storedSubjectFacts(data.sourceItems.map((item) => item.id));
		const decisions = this.decisionsOf(who, [...facts.values()]);
		const teams = new Set(data.teams.map((team) => team.slug));
		const names = new Map(data.sections.map((section) => [section.id, section.name]));
		return data.sourceItems.flatMap((source) => {
			const subject = facts.get(source.id);
			const visible = data.items.find((item) => item.id === source.id);
			if (!subject) return visible ? [{ ...visible, ...source }] : [];
			return [
				{
					...finishItem(
						dashFactsOf(subject, who.me, teams, decisions.get(source.id)),
						source.sections,
						source.sections.map((id) => names.get(id) ?? id),
						who.me,
						who.settings.dash.staleDays
					),
					...source
				}
			];
		});
	}

	protected storedSubjectFacts(keys: string[]): Map<string, SubjectFacts> {
		return new Map(
			this.allIn<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key ${IN_KEYS}`,
				keys
			).map((r) => [r.key, JSON.parse(r.facts) as SubjectFacts])
		);
	}

	protected itemMarks(keys: string[]): Map<string, ItemMark> {
		return new Map(
			this.allIn<SnoozedRow>(`SELECT * FROM dash_snoozed WHERE item_id ${IN_KEYS}`, keys).map(
				(row) => [row.item_id, markOf(row)]
			)
		);
	}

	protected itemPins(keys: string[]): Map<string, string[]> {
		return new Map(
			this.allIn<{ key: string; pinned: string }>(
				`SELECT key, pinned FROM item_pins WHERE key ${IN_KEYS}`,
				keys
			).map((r) => [r.key, JSON.parse(r.pinned) as string[]])
		);
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
		return items.map((i) => {
			const s = facts.get(i.id);
			if (!s) return { ...i, categories: [], pinnedCategories: [] };
			const placed = placeItem(
				subjectRuleFacts(s, who.me, decided.get(i.id)),
				pins.get(i.id),
				who.settings.categoryGroups
			);
			return { ...i, categories: placed.categories, pinnedCategories: placed.pinned };
		});
	}

	private trackedSeenAt(keys: string[]): Map<string, number> {
		return new Map(
			this.allIn<{ key: string; seen_at: number }>(
				`SELECT key, seen_at FROM tracked_items WHERE key ${IN_KEYS}`,
				keys
			).map((r) => [r.key, r.seen_at])
		);
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
		const subjects = [...this.storedSubjectFacts(await this.cachedItemKeys()).values()];
		const changed = await this.patchDashCaches(
			who,
			subjects,
			this.decisionsOf(who, subjects),
			false
		);
		if (!changed)
			for (const kind of ['pr', 'issue'] as const) this.broadcast({ type: 'dash', kind });
	}

	protected async cachedItemKeys(): Promise<string[]> {
		const keys = new Set<string>();
		for (const kind of ['pr', 'issue'] as const) {
			const cached = await this.ctx.storage.get<{ data: DashResponse }>(`dash:${kind}`);
			for (const i of cached?.data.sourceItems ?? cached?.data.items ?? []) keys.add(i.id);
		}
		return [...keys];
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Stores its facts,
	 * which updates its entry in the cached dashboards. About 1 point.
	 */
	recheck(repo: string, number: number): Promise<{ ok: true } | { error: string }> {
		return this.exclusive(() => this.recheckNow(repo, number));
	}

	private async recheckNow(
		repo: string,
		number: number
	): Promise<{ ok: true } | { error: string }> {
		const who = await this.who();
		if (!who) return { ok: true };
		const [owner, name] = repo.split('/');
		const key = subjectKey(repo, number);
		const reads = await fetchSubjects(who.token, [{ key, owner, repo: name, number }], who.me);
		const sub = reads.subjects.get(key);
		if (sub) await this.record(who, [sub]);
		if (sub || reads.deletedOrNoAccess.has(key)) return { ok: true };
		return { error: reads.errors[0] ?? 'GitHub did not return this PR or issue.' };
	}

	recordFetched(sub: SubjectFacts): Promise<void> {
		return this.exclusive(async () => {
			const who = await this.who();
			if (who) await this.record(who, [sub]);
		});
	}
}
