import {
	expandSections,
	finishItem,
	keepItem,
	sortItems,
	type DashFacts
} from '../../src/lib/shared/dashboard';
import type { DashKind, DashResponse } from '../../src/lib/shared/types';
import { dashFactsOf } from '../../src/lib/shared/subject';
import { searchDashboard } from '../github';
import { DASH_TTL } from './shared';
import { PollerSync } from './sync';

/** The PR and issue dashboards, from saved searches, cached for 15 minutes. */
export abstract class PollerDashboard extends PollerSync {
	private dashInflight = new Map<DashKind, Promise<DashResponse>>();

	/** Live PR or issue dashboard from saved searches, cached for 15 minutes. */
	dashboard(kind: DashKind, force = false): Promise<DashResponse> {
		let p = this.dashInflight.get(kind);
		if (!p) {
			p = this.buildDashboard(kind, force).finally(() => this.dashInflight.delete(kind));
			this.dashInflight.set(kind, p);
		}
		return p;
	}

	protected async buildDashboard(kind: DashKind, force: boolean): Promise<DashResponse> {
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
		if (!force && cached?.sig === sig && Date.now() - cached.data.fetchedAt < DASH_TTL)
			return cached.data;

		const { teams, error: teamError } = await this.teams();
		const { queries, skipped } = expandSections(dash[kind], dash, teams);
		// Each search asks for about its last count (GitHub prices what a search asks for).
		const countsKey = `dash:counts:${kind}`;
		const lastCounts = (await this.ctx.storage.get<Record<string, number>>(countsKey)) ?? {};
		const { hits, errors, counts } = await searchDashboard(who.token, who.me, queries, lastCounts);
		await this.putChanged({ [countsKey]: counts });

		const teamSet = new Set(teams.map((t) => t.slug));
		const byId = new Map<string, { facts: DashFacts; sections: Set<string> }>();
		for (const h of hits) {
			const e = byId.get(h.subject.id) ?? {
				facts: dashFactsOf(h.subject, who.me, teamSet),
				sections: new Set<string>()
			};
			e.sections.add(h.section);
			byId.set(h.subject.id, e);
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
		await this.record(
			who,
			hits.map((h) => h.subject),
			{ dash: false }
		);
		return data;
	}
}
