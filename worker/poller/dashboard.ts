import {
	expandSections,
	finishItem,
	keepItem,
	sortItems,
	type DashFacts
} from '../../src/lib/shared/dashboard';
import type { DashKind, DashResponse, ItemView } from '../../src/lib/shared/types';
import { dashFactsOf, type SubjectFacts } from '../../src/lib/shared/subject';
import { fetchDetails, forTeams, needsDetails, searchCounts, searchShort } from '../github';
import {
	MAX_SOURCE_COUNT_SEARCHES,
	searchKinds,
	sectionsFor,
	type SourceCount
} from '../../src/lib/shared/item-views';
import { boardQueryOf, readsBoard } from '../../src/lib/shared/projects';
import type { ExpandedQuery } from '../../src/lib/shared/dashboard';
import { boardCount, boardShort, itemStatuses } from '../projects';
import { projectKeyOf } from '../../src/lib/shared/grouping';
import { DASH_TTL } from './shared';
import { PollerSync } from './sync';

const RETRY_AFTER = 60_000;
const DASH_KINDS: DashKind[] = ['pr', 'issue'];

async function findItems(token: string, queries: ExpandedQuery[]) {
	const onBoards = queries.filter((q) => readsBoard(q.q));
	const searched = queries.filter((q) => !readsBoard(q.q));
	const [boards, searches] = await Promise.all([
		boardShort(token, onBoards),
		searchShort(token, searched)
	]);
	return {
		hits: [...searches.hits, ...boards.hits],
		errors: [...new Set([...searches.errors, ...boards.errors])].slice(0, 3)
	};
}
const marks = (n: number) => Array(n).fill('?').join(',');

/** The PR and issue dashboards, from saved searches, cached for 15 minutes. */
export abstract class PollerDashboard extends PollerSync {
	private dashInflight = new Map<DashKind, Promise<DashResponse>>();
	private dashRefreshing = new Map<DashKind, Promise<unknown>>();
	/** After a failed refresh, the next one waits until then (no loop of failing requests). */
	private dashRetryAt = new Map<DashKind, number>();

	/** Live PR or issue dashboard from saved searches, cached for 15 minutes. */
	dashboard(kind: DashKind, force = false): Promise<DashResponse> {
		let p = this.dashInflight.get(kind);
		if (!p) {
			p = this.buildDashboard(kind, force).finally(() => this.dashInflight.delete(kind));
			this.dashInflight.set(kind, p);
		}
		return p;
	}

	/**
	 * Refresh in the background (once at a time); when it worked, tell open pages to load it
	 * again. Returns false when no refresh runs (a failed one waits a minute).
	 */
	private refreshDashboard(kind: DashKind): boolean {
		if (this.dashRefreshing.has(kind)) return true;
		if (Date.now() < (this.dashRetryAt.get(kind) ?? 0)) return false;
		const p = this.buildDashboard(kind, true, false)
			.then(() => this.broadcast({ type: 'dash', kind }))
			.catch((err) => {
				console.error('dashboard refresh', (err as Error).message);
				this.dashRetryAt.set(kind, Date.now() + RETRY_AFTER);
			})
			.finally(() => this.dashRefreshing.delete(kind));
		this.dashRefreshing.set(kind, p);
		this.ctx.waitUntil(p);
		return true;
	}

	async countSource(query: string): Promise<SourceCount> {
		const who = await this.who();
		if (!who) throw new Error('Not signed in.');
		const { teams } = await this.teams();
		const view: ItemView = { id: 'count', name: '', searches: [query], groupBy: 'none' };
		const searches = searchKinds(query).flatMap((kind) =>
			expandSections(sectionsFor(kind, [view]), who.settings.dash, teams).queries.map((q) => ({
				kind,
				q: q.q
			}))
		);
		const asked = searches.slice(0, MAX_SOURCE_COUNT_SEARCHES);
		const onBoards = asked.filter((s) => boardQueryOf(s.q));
		const boardCounts = new Map(
			await Promise.all(onBoards.map(async (s) => [s, await boardCount(who.token, s.q)] as const))
		);
		const searchedCounts = await searchCounts(
			who.token,
			asked.filter((s) => !boardCounts.has(s)).map((s) => s.q)
		);
		const counts = asked.map((s) =>
			boardCounts.has(s) ? boardCounts.get(s)! : (searchedCounts.shift() ?? null)
		);
		const out: SourceCount = { pr: null, issue: null };
		asked.forEach((s, k) => (out[s.kind] = (out[s.kind] ?? 0) + (counts[k] ?? 0)));
		return out;
	}

	protected async rebuildTracked(kind: DashKind): Promise<void> {
		await this.buildDashboard(kind, true, false);
		this.broadcast({ type: 'dash', kind });
	}

	async rebuildBoards(): Promise<void> {
		const who = await this.who();
		if (!who) return;
		const groupsByProject = who.settings.views.some((v) => projectKeyOf(v.groupBy));
		const kinds = DASH_KINDS.filter(
			(kind) =>
				groupsByProject || sectionsFor(kind, who.settings.views).some((s) => readsBoard(s.query))
		);
		await Promise.all(kinds.map((kind) => this.rebuildTracked(kind)));
	}

	/**
	 * Build the dashboard: short searches, then details only for the items that need them (all of
	 * them when `full`). `force` skips the saved list.
	 */
	protected async buildDashboard(
		kind: DashKind,
		force: boolean,
		full = force
	): Promise<DashResponse> {
		const who = await this.who();
		if (!who) throw new Error('Not signed in.');
		const { dash, botsAreFyi, reviewResolution, newCommitsAfterReview, views } = who.settings;
		const sections = sectionsFor(kind, views);
		const sig = JSON.stringify([
			botsAreFyi,
			reviewResolution,
			newCommitsAfterReview,
			sections,
			dash.excludedTeams,
			dash.staleDays,
			dash.hideOthersDrafts,
			dash.hideBots
		]);
		const key = `dash:${kind}`;
		const cached = await this.ctx.storage.get<{ sig: string; data: DashResponse }>(key);
		if (!force && cached?.sig === sig) {
			if (Date.now() - cached.data.fetchedAt < DASH_TTL) return cached.data;
			// Old: answer with it now, and refresh behind it. Open pages update when it is done.
			return this.refreshDashboard(kind) ? { ...cached.data, refreshing: true } : cached.data;
		}

		const { teams, error: teamError } = await this.teams();
		const { queries, skipped } = expandSections(sections, dash, teams);
		const { hits, errors: searchErrors } = await findItems(who.token, queries);

		// Details: what Hush has, and only what needs a new read from GitHub.
		const latest = new Map(hits.map((h) => [h.key, h]));
		const keys = [...latest.keys()];
		const stored = this.storedFacts(keys);
		const readKey = `dash:read:${kind}`;
		const readAt = (await this.ctx.storage.get<Record<string, number>>(readKey)) ?? {};
		const now = Date.now();
		const need = keys.filter((k) =>
			needsDetails(stored.get(k), latest.get(k)!.updatedAt, readAt[k], now, full)
		);
		const { subjects: fresh, errors: detailErrors } = await fetchDetails(
			who.token,
			who.me,
			need.map((k) => latest.get(k)!.id)
		);
		const facts = new Map<string, SubjectFacts>();
		const nextRead: Record<string, number> = {};
		for (const k of keys) {
			const f = fresh.get(latest.get(k)!.id);
			if (f) nextRead[k] = now;
			else if (readAt[k]) nextRead[k] = readAt[k];
			const use = f ?? stored.get(k);
			if (use) facts.set(k, use);
		}
		await this.ctx.storage.put(readKey, nextRead);
		const errors = [...new Set([...searchErrors, ...detailErrors])].slice(0, 3);

		await this.decideSubjects(who, [...facts.values()]);
		const decided = this.decisionsOf(who, [...facts.values()]);
		const teamSet = new Set(teams.map((t) => t.slug));
		const byId = new Map<string, { facts: DashFacts; sections: Set<string> }>();
		for (const h of hits) {
			const subject = facts.get(h.key);
			if (!subject || !forTeams(h.query, subject, who.me)) continue;
			const e = byId.get(h.key) ?? {
				facts: dashFactsOf(subject, who.me, teamSet, decided.get(h.key)),
				sections: new Set<string>()
			};
			e.sections.add(h.query.section);
			byId.set(h.key, e);
		}
		const boardSections = new Set(sections.filter((s) => readsBoard(s.query)).map((s) => s.id));
		const placedOnBoard = (found: Set<string>) => [...found].some((id) => boardSections.has(id));
		const items = sortItems(
			[...byId.values()]
				.filter(({ facts, sections }) => keepItem(facts, who.me, dash) || placedOnBoard(sections))
				.map(({ facts, sections }) => {
					const ordered = views.filter((v) => sections.has(v.id));
					return finishItem(
						facts,
						ordered.map((s) => s.id),
						ordered.map((s) => s.name),
						who.me,
						dash.staleDays,
						Date.now(),
						{ botsAreFyi, reviewResolution, newCommitsAfterReview }
					);
				})
		);
		const placed = this.placeItems(who, items, facts);
		const marksChanged = this.storePlacements(placed, true);
		const complete = !searchErrors.length && !detailErrors.length;
		if (cached && cached.sig !== sig && complete)
			await this.untrackMissing(
				kind,
				placed.map((i) => i.id)
			);
		await this.storeTrackedBuild(kind, complete);
		if (marksChanged) await this.bumpVersion();
		const nodeIdOf = (key: string) => latest.get(key)?.id ?? '';
		const statuses =
			who.projectAccess === 'none'
				? null
				: await itemStatuses(who.token, placed.map((i) => nodeIdOf(i.id)).filter(Boolean));
		const data: DashResponse = {
			kind,
			items: statuses
				? placed.map((i) => ({ ...i, projectStatus: statuses.statusOf.get(nodeIdOf(i.id)) ?? {} }))
				: placed,
			...(statuses && { projects: statuses.projects }),
			sections: views.map((v) => ({
				id: v.id,
				name: v.name,
				count: placed.filter((i) => i.sections.includes(v.id)).length,
				...(skipped[v.id] ? { skipped: skipped[v.id] } : {})
			})),
			teams,
			fetchedAt: Date.now(),
			errors: [
				...new Set([...(teamError ? [teamError] : []), ...errors, ...(statuses?.errors ?? [])])
			].slice(0, 3)
		};
		await this.ctx.storage.put(key, { sig, data });
		// The search saw these PRs and issues now: the inbox follows (this cache is already new).
		await this.record(who, [...fresh.values()], { dash: false });
		return data;
	}

	/** The stored facts of these PRs and issues ("owner/repo#123"). */
	private storedFacts(keys: string[]): Map<string, SubjectFacts> {
		const out = new Map<string, SubjectFacts>();
		for (let i = 0; i < keys.length; i += 50) {
			const chunk = keys.slice(i, i + 50);
			for (const r of this.all<{ key: string; facts: string }>(
				`SELECT key, facts FROM subjects WHERE key IN (${marks(chunk.length)})`,
				...chunk
			))
				out.set(r.key, JSON.parse(r.facts) as SubjectFacts);
		}
		return out;
	}
}
