import type { DashItem, DashProject, TeamDTO } from '../shared/types';
import type { createEvaluator } from './evaluate';
import type { CompiledView, ItemId, Row, SourceHealth, ViewState } from './types';

export type ViewRow = DashItem;

export interface ViewSummary {
	id: string;
	health: SourceHealth[];
	skipped: string | null;
	nextBoundary: number | null;
}

export interface ItemsResponse {
	revision: number;
	evaluatedAt: number;
	rows: ViewRow[];
	views: ViewSummary[];
	projects: DashProject[];
	teams: TeamDTO[];
}

export interface PresentInput {
	revision: number;
	now: number;
	views: CompiledView[];
	states: ReadonlyMap<string, ViewState>;
	evaluator: ReturnType<typeof createEvaluator>;
	projects: DashProject[];
	teams: TeamDTO[];
}

export function presentItems(input: PresentInput): ItemsResponse {
	const rows = new Map<ItemId, ViewRow>();
	const summaries: ViewSummary[] = [];
	for (const view of input.views) {
		const result = input.evaluator.evaluate(view, input.states.get(view.view.id) ?? null);
		summaries.push({
			id: view.view.id,
			health: result.membership.health,
			skipped: view.skipped,
			nextBoundary: result.nextBoundary
		});
		for (const row of result.rows) {
			const known = rows.get(row.itemId) ?? { ...row, views: [], retainedIn: [] };
			if (row.retained) known.retainedIn.push(view.view.id);
			else known.views.push(view.view.id);
			rows.set(row.itemId, { ...known, retained: known.views.length === 0 });
		}
	}
	return {
		revision: input.revision,
		evaluatedAt: input.now,
		rows: [...rows.values()],
		views: summaries,
		projects: input.projects,
		teams: input.teams
	};
}

export const rowInView = (row: ViewRow, viewId: string) =>
	row.views.includes(viewId) || row.retainedIn.includes(viewId);
