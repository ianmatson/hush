import { keys, queryClient } from './queries';
import { itemQueryFacts } from './shared/categories';
import { ruleMatches } from './shared/rules';
import { compileExpr, exprMatches, parseExpr, type QueryExpr } from './shared/query';
import type { DashItem, DashResponse, RuleMatch, Settings } from './shared/types';
import type { RulePreview } from './components/app/rules/rule-builder.svelte';
import type { BuilderField } from './shared/rule-builder';

const MAX_EXAMPLES = 20;

function withoutAbout(when: RuleMatch): RuleMatch {
	const { about: _about, ...rest } = when;
	return rest;
}

const usesAbout = (expr: QueryExpr): boolean =>
	expr.kind === 'match'
		? !!expr.when.about?.length
		: expr.kind === 'not'
			? usesAbout(expr.part)
			: expr.parts.some(usesAbout);

export function cachedItems(): DashItem[] {
	return (['pr', 'issue'] as const).flatMap(
		(kind) => queryClient.getQueryData<DashResponse>(keys.dash(kind))?.items ?? []
	);
}

export function previewItems(
	query: string,
	me: string,
	settings: Pick<Settings, 'views'>,
	items: DashItem[] = cachedItems()
): RulePreview | null {
	if (!query.trim() || parseExpr(query).errors.length || !items.length) return null;
	const expr = compileExpr(query);
	const matched = items.filter((i) => {
		const facts = itemQueryFacts(i, me, settings);
		return exprMatches(expr, (when) => ruleMatches(withoutAbout(when), facts));
	});
	return {
		matched: matched.length,
		total: items.length,
		noun: 'open PRs and issues',
		examples: matched
			.slice(0, MAX_EXAMPLES)
			.map((i) => ({ title: i.title, detail: `${i.repo}#${i.number}`, url: i.url })),
		jevDecides: usesAbout(expr)
	};
}

const uniq = (xs: (string | null | undefined)[]) =>
	[...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

export function ruleSuggestions(
	settings: Pick<Settings, 'views'> | undefined
): Partial<Record<NonNullable<BuilderField['suggest']>, string[]>> {
	const items = cachedItems();
	const repos = uniq(items.map((i) => i.repo));
	return {
		repo: [...uniq(repos.map((r) => `${r.split('/')[0]}/*`)), ...repos],
		person: ['@me', 'bots', ...uniq(items.map((i) => i.author))],
		label: uniq(items.flatMap((i) => i.labels.map((l) => l.name))),
		view: uniq(settings?.views.map((v) => v.name) ?? [])
	};
}
