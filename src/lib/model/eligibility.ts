import { categoryQueryName, groupChoice } from '../shared/categories';
import { conditionId } from '../shared/decisions';
import { compileExpr, queryError, type QueryExpr } from '../shared/query';
import { matchGlobs, ruleMatches } from '../shared/rules';
import type { CategoryGroup, RuleFacts, RuleMatch } from '../shared/types';

export type Tri = boolean | null;

export interface Knowledge {
	smartOn: boolean;
	about: ReadonlyMap<string, boolean | null>;
	choices: ReadonlyMap<string, string>;
}

export interface GroupPlacement {
	group: CategoryGroup;
	possible: (string | null)[];
}

export const placedCategory = (placement: GroupPlacement) =>
	placement.possible.length === 1 ? placement.possible[0] : null;

const all = (values: Tri[]): Tri =>
	values.includes(false) ? false : values.includes(null) ? null : true;

const any = (values: Tri[]): Tri =>
	values.includes(true) ? true : values.includes(null) ? null : false;

export function exprTri(expr: QueryExpr, leaf: (when: RuleMatch) => Tri): Tri {
	switch (expr.kind) {
		case 'match':
			return leaf(expr.when);
		case 'and':
			return all(expr.parts.map((part) => exprTri(part, leaf)));
		case 'or':
			return any(expr.parts.map((part) => exprTri(part, leaf)));
		case 'not': {
			const value = exprTri(expr.part, leaf);
			return value === null ? null : !value;
		}
	}
}

function aboutTri(texts: string[], knowledge: Knowledge): Tri {
	if (!knowledge.smartOn) return false;
	return any(texts.map((text) => knowledge.about.get(conditionId(text)) ?? null));
}

function categoryTri(globs: string[], placements: GroupPlacement[]): Tri {
	const matches = (group: CategoryGroup, categoryId: string | null) => {
		const category = group.categories.find((c) => c.id === categoryId);
		return !!category && matchGlobs(categoryQueryName(group, category), globs);
	};
	return any(
		placements.map((placement) => {
			const outcomes = placement.possible.map((id) => matches(placement.group, id));
			return outcomes.every(Boolean) ? true : outcomes.some(Boolean) ? null : false;
		})
	);
}

function leafTri(
	when: RuleMatch,
	facts: RuleFacts,
	knowledge: Knowledge,
	placements: GroupPlacement[]
): Tri {
	const { about, category, ...known } = when;
	if (!ruleMatches(known, facts)) return false;
	return all([
		about?.length ? aboutTri(about, knowledge) : true,
		category?.length ? categoryTri(category, placements) : true
	]);
}

const usableRule = (rule: string) => !!rule.trim() && !queryError(rule);

export function queryTri(
	query: string,
	facts: RuleFacts,
	knowledge: Knowledge,
	placements: GroupPlacement[]
): Tri {
	if (!query.trim()) return true;
	return exprTri(compileExpr(query), (when) => leafTri(when, facts, knowledge, placements));
}

function placeGroup(
	group: CategoryGroup,
	facts: RuleFacts,
	pins: readonly string[],
	knowledge: Knowledge
): GroupPlacement {
	const pinned = group.categories.find((category) => pins.includes(category.id));
	if (pinned) return { group, possible: [pinned.id] };
	const possible = new Set<string | null>();
	for (const category of group.categories) {
		if (!usableRule(category.rule)) continue;
		const value = queryTri(category.rule, facts, knowledge, []);
		if (value === false) continue;
		possible.add(category.id);
		if (value) return { group, possible: [...possible] };
	}
	for (const outcome of fallbackOutcomes(group, knowledge)) possible.add(outcome);
	return { group, possible: [...possible] };
}

function fallbackOutcomes(group: CategoryGroup, knowledge: Knowledge): (string | null)[] {
	const choice = knowledge.smartOn ? groupChoice(group) : null;
	if (!choice) return [null];
	const selectable = Object.keys(choice.options);
	if (!knowledge.choices.has(choice.key)) return [...selectable, null];
	const chosen = knowledge.choices.get(choice.key)!;
	return [selectable.includes(chosen) ? chosen : null];
}

export const placeGroups = (
	groups: CategoryGroup[],
	facts: RuleFacts,
	pins: readonly string[],
	knowledge: Knowledge
) => groups.map((group) => placeGroup(group, facts, pins, knowledge));
