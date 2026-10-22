import { keys, queryClient } from './queries';
import { categoryQueryName, itemQueryFacts } from './shared/categories';
import { ruleMatches } from './shared/rules';
import { compileExpr, exprMatches, parseExpr, usesAbout } from './shared/query';
import type { DashItem, RuleMatch, Settings } from './shared/types';
import type { ItemsResponse } from './model/present';
import type { RulePreview } from './components/app/rules/rule-builder.svelte';
import type { ValueSuggestion, ValueSuggestions } from './shared/rule-builder';

const MAX_EXAMPLES = 20;

function withoutAbout(when: RuleMatch): RuleMatch {
	const { about: _about, ...rest } = when;
	return rest;
}

const cachedItems = (): DashItem[] =>
	queryClient.getQueryData<ItemsResponse>(keys.items)?.rows ?? [];

export function previewItems(
	query: string,
	me: string,
	settings: Pick<Settings, 'categoryGroups'>,
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

const plain = (values: string[]): ValueSuggestion[] =>
	values.map((value) => ({ value, label: value }));

export function ruleSuggestions(
	settings: Pick<Settings, 'categoryGroups'> | undefined,
	items: DashItem[] = cachedItems()
): ValueSuggestions {
	const repos = uniq(items.map((i) => i.repo));
	return {
		repo: plain([...uniq(repos.map((r) => `${r.split('/')[0]}/*`)), ...repos]),
		person: plain(['@me', 'bots', ...uniq(items.map((i) => i.author))]),
		label: plain(uniq(items.flatMap((i) => i.labels.map((l) => l.name)))),
		category: (settings?.categoryGroups ?? []).flatMap((g) =>
			g.categories.map((c) => ({ value: categoryQueryName(g, c), label: c.name, group: g.name }))
		)
	};
}
