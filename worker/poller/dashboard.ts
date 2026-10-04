import {
	expandSections,
	finishItem,
	keepItem,
	sortItems,
	type DashFacts
} from '../../src/lib/shared/dashboard';
import type { DashKind, DashResponse } from '../../src/lib/shared/types';
import { dashFactsOf, type SubjectFacts } from '../../src/lib/shared/subject';
import { fetchDetails, forTeams, needsDetails, searchShort } from '../github';
import { DASH_TTL } from './shared';
import { PollerSync } from './sync';

const RETRY_AFTER = 60_000;
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
		const { dash, botsAreFyi, reviewResolution } = who.settings;
		const sig = JSON.stringify([
			botsAreFyi,
			reviewResolution,
			dash[kind],
			dash.scope,
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
		const { queries, skipped } = expandSections(dash[kind], dash, teams);
		const { hits, errors: searchErrors } = await searchShort(who.token, queries);

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
			if (!subject || !forTeams(h.query, subject)) continue;
			const e = byId.get(h.key) ?? {
				facts: dashFactsOf(subject, who.me, teamSet, decided.get(h.key)),
				sections: new Set<string>()
			};
			e.sections.add(h.query.section);
			byId.set(h.key, e);
		}
		const enabled = dash[kind].filter((s) => s.enabled);
		const items = sortItems(
			[...byId.values()]
				.filter(({ facts }) => keepItem(facts, who.me, dash))
				.map(({ facts, sections }) => {
					const ordered = enabled.filter((s) => sections.has(s.id));
					return finishItem(
						facts,
						ordered.map((s) => s.id),
						ordered.map((s) => s.name),
						who.me,
						dash.staleDays,
						Date.now(),
						{ botsAreFyi, reviewResolution }
					);
				})
		);
		const data: DashResponse = {
			kind,
			items,
			sections: enabled.map((s) => ({
				id: s.id,
				name: s.name,
				count: items.filter((i) => i.sections.includes(s.id)).length,
				...(skipped[s.id] ? { skipped: skipped[s.id] } : {})
			})),
			teams,
			fetchedAt: Date.now(),
			errors: teamError ? [teamError, ...errors] : errors
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
