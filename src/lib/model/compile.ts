import { searchFindsOnlyOpen } from '../shared/closed-items';
import { expandSections } from '../shared/dashboard';
import { cyrb53 } from '../shared/decisions';
import { searchKinds, withKind } from '../shared/item-views';
import { readsBoard } from '../shared/projects';
import { resolveToday, splitSearch } from '../shared/query';
import type { CategoryGroup, DashSettings, ItemView, TeamDTO } from '../shared/types';
import type { Clause, CompiledView, SourceSpec } from './types';

const CATEGORY_WORD = /(?:^|\s)-?category:/i;

export interface CompileContext {
	dash: DashSettings;
	categoryGroups: CategoryGroup[];
	smartDecisions: boolean;
	teams: TeamDTO[];
	analysisVersion: string;
	now: number;
}

export interface Compiled {
	views: CompiledView[];
	sources: SourceSpec[];
}

export const filtersByCategory = (local: string) => CATEGORY_WORD.test(local);

export const usesCategories = (view: Pick<ItemView, 'searches'>) =>
	view.searches.some((search) => filtersByCategory(splitSearch(search).hush));

export function viewScope(view: ItemView, ctx: Omit<CompileContext, 'teams' | 'now'>): string {
	const { hideBots, hideOthersDrafts, excludedTeams } = ctx.dash;
	return cyrb53(
		JSON.stringify([
			view.searches,
			hideBots,
			hideOthersDrafts,
			[...excludedTeams].sort(),
			usesCategories(view) ? [ctx.categoryGroups, ctx.smartDecisions, ctx.analysisVersion] : null
		])
	);
}

function sourceSpecOf(kind: SourceSpec['kind'], template: string, now: number): SourceSpec {
	const adapter = readsBoard(template) ? 'board' : 'search';
	return {
		id: cyrb53(JSON.stringify([adapter, kind, template])),
		adapter,
		kind,
		query: resolveToday(template, now)
	};
}

function compileView(view: ItemView, ctx: CompileContext, sources: Map<string, SourceSpec>) {
	const clauses: Clause[] = [];
	const skipped: string[] = [];
	for (const search of view.searches) {
		const { github, hush } = splitSearch(search);
		for (const kind of searchKinds(search)) {
			const section = { id: view.id, name: view.name, query: withKind(kind, github), filter: hush };
			const expanded = expandSections([section], ctx.dash, ctx.teams);
			skipped.push(...Object.values(expanded.skipped));
			for (const query of expanded.queries) {
				const spec = sourceSpecOf(kind, query.q, ctx.now);
				sources.set(spec.id, spec);
				clauses.push({
					binding: [view.id, cyrb53(search), kind, query.team ?? ''].join('|'),
					sourceId: spec.id,
					kind,
					local: query.filter ?? '',
					onBoard: spec.adapter === 'board',
					openOnly: searchFindsOnlyOpen(query.q),
					teams: query.teams ?? null,
					orDirect: !!query.orDirect
				});
			}
		}
	}
	return {
		view,
		scope: viewScope(view, ctx),
		clauses,
		skipped: skipped.length ? [...new Set(skipped)].join(' ') : null
	} satisfies CompiledView;
}

export function compileViews(views: ItemView[], ctx: CompileContext): Compiled {
	const sources = new Map<string, SourceSpec>();
	const compiled = views.map((view) => compileView(view, ctx, sources));
	return { views: compiled, sources: [...sources.values()] };
}
