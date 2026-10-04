import { classify, classifyDefault, shouldPush, withOverride } from '../../src/lib/shared/classify';
import {
	FALLBACK_CATEGORY_ID,
	placeItem,
	type ItemPins,
	type Placement
} from '../../src/lib/shared/categories';

const NOT_YOUR_TURN = 'none';
import { TRACKED_SOURCE } from '../../src/lib/shared/sources';
import { finishItem, keepItem, sortItems } from '../../src/lib/shared/dashboard';
import { watchOutcome } from '../../src/lib/shared/watch';
import type { DashItem, DashResponse, ThreadFacts } from '../../src/lib/shared/types';
import {
	dashFactsOf,
	enrichmentOf,
	subjectKey,
	type SubjectFacts
} from '../../src/lib/shared/subject';
import type { SubjectDecisions } from '../../src/lib/shared/decisions';
import { fetchSubjects } from '../github';
import { SNOOZE_OVER_REASON, type PushCandidate } from './alerts';
import { PollerDecisions } from './decisions';
import { subjectRefOf, type ThreadRow } from './schema';
import { MAX_INDIVIDUAL_PUSHES, type Resolved, type Who } from './shared';

/** SQLite binds at most this many values per statement here; longer IN lists go in chunks. */
const CHUNK = 90;
const marks = (n: number) => Array(n).fill('?').join(',');
const parse = (json: string | undefined) => (json ? (JSON.parse(json) as SubjectFacts) : null);

/** A thread, and its subject's facts now and before this read. */
type Apply = { row: ThreadRow; fresh: SubjectFacts; before: SubjectFacts | null };

/**
 * The subject store. Every GitHub read of a PR or issue goes through `record`, which keeps the
 * one copy of its facts and updates every view of it: the inbox threads and the cached dashboards.
 */
export abstract class PollerSubjects extends PollerDecisions {
	/**
	 * Store fresh facts from GitHub, then update the views. The threads about these subjects get
	 * the facts whether or not they changed, so a thread that is out of date catches up. The
	 * dashboard build passes `dash: false` (its cache is already new); ingest passes
	 * `threads: false` (it writes those threads itself).
	 */
	protected async record(
		who: Who,
		subjects: SubjectFacts[],
		opts: { dash?: boolean; threads?: boolean; quiet?: boolean } = {}
	): Promise<{ changed: number; resolved: Resolved[]; wrote: number }> {
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
		if (opts.dash !== false)
			await this.patchDashCaches(
				who,
				changed.map(([, x]) => x),
				decided
			);
		if (opts.threads === false || !keys.length)
			return { changed: changed.length, resolved: [], wrote: 0 };

		const items: Apply[] = [];
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const row of this.all<ThreadRow>(
				`SELECT * FROM threads WHERE category != 'muted' AND subject_key IN (${marks(chunk.length)})`,
				...chunk
			))
				items.push({
					row,
					fresh: fresh.get(row.subject_key!)!,
					before: parse(stored.get(row.subject_key!))
				});
		}
		const out = await this.applyFacts(who, items, decided, opts);
		return { changed: changed.length, ...out };
	}

	/** Read these threads' PRs and issues again (the watcher, the refresh button). */
	protected async refresh(
		who: Who,
		rows: Pick<ThreadRow, 'id' | 'subject_key'>[],
		opts: { quiet?: boolean } = {}
	): Promise<Resolved[]> {
		const refs = rows.flatMap((r) => subjectRefOf(r) ?? []);
		if (!refs.length) return [];
		const fetched = await fetchSubjects(who.token, refs, who.me);
		return (await this.record(who, [...fetched.values()], opts)).resolved;
	}

	/** Replace changed subjects in the cached dashboards (and drop the ones that closed). */
	protected async patchDashCaches(
		who: Who,
		subs: SubjectFacts[],
		decided: Map<string, SubjectDecisions> = new Map()
	) {
		if (!subs.length) return;
		const { dash, botsAreFyi, reviewResolution } = who.settings;
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
							Date.now(),
							{ botsAreFyi, reviewResolution }
						)
					];
				})
			);
			const items = this.placeItems(who, patched, byId);
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

	protected itemPins(keys: string[]): Map<string, ItemPins> {
		const out = new Map<string, ItemPins>();
		for (let i = 0; i < keys.length; i += CHUNK) {
			const chunk = keys.slice(i, i + CHUNK);
			for (const r of this.all<{
				key: string;
				category: string | null;
				tags_on: string;
				tags_off: string;
			}>(
				`SELECT key, category, tags_on, tags_off FROM item_pins WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				out.set(r.key, {
					category: r.category,
					tagsOn: JSON.parse(r.tags_on) as string[],
					tagsOff: JSON.parse(r.tags_off) as string[]
				});
		}
		return out;
	}

	private placements(
		who: Who,
		entries: { key: string; sections: string[] }[],
		known: Map<string, SubjectFacts> = new Map()
	): Map<string, Placement> {
		const out = new Map<string, Placement>();
		if (!entries.length) return out;
		const keys = entries.map((e) => e.key);
		const facts = new Map(known);
		const missing = keys.filter((k) => !facts.has(k));
		for (const [k, f] of this.storedSubjectFacts(missing)) facts.set(k, f);
		const decided = this.decisionsOf(who, [...facts.values()]);
		const pins = this.itemPins(keys);
		const sourceNames = new Map(
			[...who.settings.sources, TRACKED_SOURCE].map((x) => [x.id, x.name])
		);
		for (const { key, sections } of entries) {
			const s = facts.get(key);
			if (!s) continue;
			const d = decided.get(key);
			const t: ThreadFacts = {
				repo: s.repo,
				subjectType: s.kind === 'pr' ? 'PullRequest' : 'Issue',
				title: s.title,
				reason: '',
				htmlUrl: s.url,
				enrichment: enrichmentOf(s, who.me, d),
				me: who.me,
				myTeams: who.inboxTeams,
				sources: sections.map((id) => sourceNames.get(id) ?? id)
			};
			out.set(
				key,
				placeItem(
					t,
					classifyDefault(t, who.settings),
					d?.category ?? null,
					pins.get(key),
					who.settings
				)
			);
		}
		return out;
	}

	protected placeItems(
		who: Who,
		items: DashItem[],
		known: Map<string, SubjectFacts> = new Map()
	): DashItem[] {
		const placed = this.placements(
			who,
			items.map((i) => ({ key: i.id, sections: i.sections })),
			known
		);
		return items.map((i) => {
			const p = placed.get(i.id);
			return { ...i, category: p?.category ?? FALLBACK_CATEGORY_ID, tags: p?.tags ?? [] };
		});
	}

	protected async withCategoryPush(
		who: Who,
		candidates: PushCandidate[]
	): Promise<PushCandidate[]> {
		const modes = new Map(who.settings.categories.map((c) => [c.id, c.push ?? 'inherit'] as const));
		if (!candidates.length || [...modes.values()].every((m) => m === 'inherit')) return candidates;
		const sections = await this.cachedSectionsByKey();
		const placed = this.placements(
			who,
			[...new Set(candidates.map((c) => c.itemKey))].map((key) => ({
				key,
				sections: sections.get(key) ?? []
			}))
		);
		return candidates.map((c) => {
			if (c.reason === SNOOZE_OVER_REASON) return c;
			const mode = modes.get(placed.get(c.itemKey)?.category ?? FALLBACK_CATEGORY_ID) ?? 'inherit';
			if (mode === 'off') return { ...c, pushes: false };
			if (mode === 'on') return { ...c, pushes: c.reason !== NOT_YOUR_TURN };
			return c;
		});
	}

	private async cachedSectionsByKey(): Promise<Map<string, string[]>> {
		const out = new Map<string, string[]>();
		for (const kind of ['pr', 'issue'] as const) {
			const cached = await this.ctx.storage.get<{ data: DashResponse }>(`dash:${kind}`);
			for (const i of cached?.data.items ?? []) out.set(i.id, i.sections);
		}
		return out;
	}

	protected async rePlaceCachedItems(who: Who): Promise<void> {
		for (const kind of ['pr', 'issue'] as const) {
			const key = `dash:${kind}`;
			const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
			if (!cached) continue;
			const items = this.placeItems(who, cached.data.items);
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
	 * Apply fresh facts to inbox threads: classify, then watchOutcome (resolve, reopen, wake).
	 * Writes only threads that changed, and pushes what now needs you.
	 */
	private async applyFacts(
		who: Who,
		items: Apply[],
		decided: Map<string, SubjectDecisions>,
		opts: { quiet?: boolean } = {}
	): Promise<{ resolved: Resolved[]; wrote: number }> {
		const { me, settings, inboxTeams: myTeams } = who;
		const writes: (() => void)[] = [];
		const candidates: PushCandidate[] = [];
		const resolved: Resolved[] = [];
		const now = Date.now();
		for (const { row: r, fresh, before } of items) {
			const e = enrichmentOf(fresh, me, decided.get(r.subject_key!));
			const c = withOverride(
				classify(
					{
						repo: r.repo,
						subjectType: r.subject_type,
						title: r.title,
						reason: r.reason,
						htmlUrl: r.html_url,
						enrichment: e,
						me,
						myTeams
					},
					settings
				),
				r,
				r.gh_updated_at
			);
			const out = watchOutcome(
				{
					category: r.category,
					kind: r.kind,
					triage: r.triage,
					enrichment: before ? enrichmentOf(before, me) : null,
					resolvedAt: r.resolved_at,
					snoozeEvent: r.snooze_event,
					snoozedAt: r.snoozed_at
				},
				c,
				e,
				me
			);
			const triage = out.triage;
			const resolvedAt = out.resolvedAt;
			const note = triage === 'done' ? (out.resolvedNote ?? r.resolved_note) : null;
			const clearSnooze = out.clearSnooze;
			const same =
				c.category === r.category &&
				c.kind === r.kind &&
				c.summary === r.summary &&
				c.why === r.why &&
				c.actionLabel === r.action_label &&
				c.actionUrl === r.action_url &&
				(c.rule ?? null) === r.rule &&
				triage === r.triage &&
				resolvedAt === r.resolved_at &&
				note === r.resolved_note &&
				!clearSnooze;
			if (same) continue;
			writes.push(() =>
				this.run(
					`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?,
             rule = ?, triage = ?, resolved_at = ?, resolved_note = ?,
             snoozed_until = CASE WHEN ? THEN NULL ELSE snoozed_until END,
             snooze_event = CASE WHEN ? THEN NULL ELSE snooze_event END
           WHERE id = ?`,
					c.category,
					c.kind,
					c.summary,
					c.why,
					c.actionLabel,
					c.actionUrl,
					c.rule ?? null,
					triage,
					resolvedAt,
					note,
					clearSnooze ? 1 : 0,
					clearSnooze ? 1 : 0,
					r.id
				)
			);
			if (out.resolvedNote) resolved.push({ id: r.id, title: r.title, note: out.resolvedNote });
			const snoozeOver = out.push?.startsWith('Snooze over') ?? false;
			const wanted = snoozeOver
				? settings.pushAction
				: settings.pushTurnChanges && shouldPush(c, settings);
			if (out.push && r.subject_key)
				candidates.push({
					itemKey: r.subject_key,
					reason: snoozeOver ? SNOOZE_OVER_REASON : c.kind,
					ignoresRepeatSetting: snoozeOver,
					pushes: wanted,
					urgent: !snoozeOver && c.category === 'action' && !!e.urgent,
					message: { title: out.push, body: `${r.title}\n${r.repo}`, url: c.actionUrl }
				});
		}
		if (writes.length) {
			this.transaction(() => writes.forEach((w) => w()));
			await this.bumpVersion();
		}
		if (!opts.quiet)
			await this.deliver(
				(await this.withCategoryPush(who, candidates)).slice(0, MAX_INDIVIDUAL_PUSHES)
			);
		return { resolved, wrote: writes.length };
	}

	/**
	 * Check one PR or issue now: you just came back to Hush from it on GitHub. Stores its facts,
	 * which updates its inbox threads and its entry in the cached dashboards. About 1 point.
	 */
	async recheck(
		repo: string,
		number: number
	): Promise<{ resolved: { title: string; note: string }[] }> {
		const who = await this.who();
		if (!who) return { resolved: [] };
		const [owner, name] = repo.split('/');
		const key = subjectKey(repo, number);
		const fetched = await fetchSubjects(who.token, [{ key, owner, repo: name, number }], who.me);
		const sub = fetched.get(key);
		if (!sub) return { resolved: [] };
		const out = await this.record(who, [sub]);
		return { resolved: out.resolved.map(({ title, note }) => ({ title, note })) };
	}

	/**
	 * Facts that the API fetched (the peek): store them and update every view. `changed` tells the
	 * browser to refetch its lists.
	 */
	async recordFetched(
		sub: SubjectFacts
	): Promise<{ changed: boolean; resolved: { title: string; note: string }[] }> {
		const who = await this.who();
		if (!who) return { changed: false, resolved: [] };
		const out = await this.record(who, [sub]);
		return {
			changed: out.changed > 0 || out.wrote > 0,
			resolved: out.resolved.map(({ title, note }) => ({ title, note }))
		};
	}
}
