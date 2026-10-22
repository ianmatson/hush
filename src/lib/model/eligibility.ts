import { categoryQueryName, groupChoice } from '../shared/categories';
import { conditionId } from '../shared/decisions';
import { compileExpr, queryError, type QueryExpr } from '../shared/query';
import { matchGlobs, ruleMatches } from '../shared/rules';
import type { CategoryGroup, RuleFacts, RuleMatch } from '../shared/types';

export type Tri = boolean | null;

export interface Knowledge {
	smartOn: boolean;
	about: ReadonlyMap<string, boolean>;
	choices: ReadonlyMap<string, string>;
}

export interface GroupPlacement {
	group: CategoryGroup;
	categoryId: string | null;
	known: boolean;
}

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
	const answers = texts.map((text) => knowledge.about.get(conditionId(text)));
	if (answers.includes(true)) return true;
	return answers.includes(undefined) ? null : false;
}

function categoryTri(globs: string[], placements: GroupPlacement[]): Tri {
	const nameOf = (placement: GroupPlacement, categoryId: string | null) => {
		const category = placement.group.categories.find((c) => c.id === categoryId);
		return category ? categoryQueryName(placement.group, category) : undefined;
	};
	const matches = (name: string | undefined) => !!name && matchGlobs(name, globs);
	if (placements.some((p) => p.known && matches(nameOf(p, p.categoryId)))) return true;
	const couldMatch = (p: GroupPlacement) =>
		!p.known && p.group.categories.some((c) => matches(nameOf(p, c.id)));
	return placements.some(couldMatch) ? null : false;
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
	if (pinned) return { group, categoryId: pinned.id, known: true };
	for (const category of group.categories) {
		if (!usableRule(category.rule)) continue;
		const value = queryTri(category.rule, facts, knowledge, []);
		if (value === null) return { group, categoryId: null, known: false };
		if (value) return { group, categoryId: category.id, known: true };
	}
	const choice = knowledge.smartOn ? groupChoice(group) : null;
	if (!choice) return { group, categoryId: null, known: true };
	if (!knowledge.choices.has(choice.key)) return { group, categoryId: null, known: false };
	const chosen = knowledge.choices.get(choice.key);
	const valid = group.categories.some((category) => category.id === chosen);
	return { group, categoryId: valid ? chosen! : null, known: true };
}

export const placeGroups = (
	groups: CategoryGroup[],
	facts: RuleFacts,
	pins: readonly string[],
	knowledge: Knowledge
) => groups.map((group) => placeGroup(group, facts, pins, knowledge));
