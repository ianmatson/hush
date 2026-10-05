import { keys, queryClient } from './queries';
import { itemQueryFacts } from './shared/categories';
import { ruleMatches } from './shared/classify';
import { compileExpr, exprMatches, parseExpr, type QueryExpr } from './shared/query';
import type {
	Classification,
	DashItem,
	DashResponse,
	RuleMatch,
	Settings,
	ThreadDTO
} from './shared/types';
import { threadMatches } from './shared/views';
import type { RulePreview } from './components/app/rules/rule-builder.svelte';
import type { BuilderField } from './shared/rule-builder';

const MAX_EXAMPLES = 3;
const NO_CLASSIFICATION = { category: 'fyi', kind: 'none' } as Classification;

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

export function cachedThreads(): ThreadDTO[] {
	const byId = new Map<string, ThreadDTO>();
	for (const [, data] of queryClient.getQueriesData<{ threads: ThreadDTO[] }>({
		queryKey: keys.threadsAll
	}))
		for (const t of data?.threads ?? []) byId.set(t.id, t);
	return [...byId.values()];
}

export function previewItems(
	query: string,
	me: string,
	settings: Pick<Settings, 'categories' | 'tags' | 'sources'>,
	items: DashItem[] = cachedItems()
): RulePreview | null {
	if (!query.trim() || parseExpr(query).errors.length || !items.length) return null;
	const expr = compileExpr(query);
	const matched = items.filter((i) => {
		const facts = itemQueryFacts(i, me, settings);
		return exprMatches(expr, (when) => ruleMatches(withoutAbout(when), facts, NO_CLASSIFICATION));
	});
	return {
		matched: matched.length,
		total: items.length,
		noun: 'open PRs and issues',
		examples: matched
			.slice(0, MAX_EXAMPLES)
			.map((i) => ({ title: i.title, detail: `${i.repo}#${i.number}` })),
		jevDecides: usesAbout(expr)
	};
}

export function previewThreads(
	query: string,
	me: string,
	threads: ThreadDTO[] = cachedThreads()
): RulePreview | null {
	if (!query.trim() || parseExpr(query).errors.length || !threads.length) return null;
	const expr = compileExpr(query);
	const matched = threads.filter((t) =>
		exprMatches(expr, (when) => threadMatches(withoutAbout(when), t, me))
	);
	return {
		matched: matched.length,
		total: threads.length,
		noun: 'notifications',
		examples: matched.slice(0, MAX_EXAMPLES).map((t) => ({ title: t.summary, detail: t.title })),
		jevDecides: usesAbout(expr)
	};
}

export function previewBoth(
	query: string,
	me: string,
	settings: Pick<Settings, 'categories' | 'tags' | 'sources'>
): RulePreview | null {
	const items = previewItems(query, me, settings);
	const threads = previewThreads(query, me);
	if (!items || !threads) return items ?? threads;
	return {
		matched: items.matched,
		total: items.total,
		noun: `open PRs and issues, and ${threads.matched} of ${threads.total} notifications`,
		examples: [...items.examples, ...threads.examples].slice(0, MAX_EXAMPLES),
		jevDecides: items.jevDecides
	};
}

const uniq = (xs: (string | null | undefined)[]) =>
	[...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

export function ruleSuggestions(
	settings: Pick<Settings, 'categories' | 'tags' | 'sources'> | undefined
): Partial<Record<NonNullable<BuilderField['suggest']>, string[]>> {
	const items = cachedItems();
	const threads = cachedThreads();
	const repos = uniq([...items.map((i) => i.repo), ...threads.map((t) => t.repo)]);
	return {
		repo: [...uniq(repos.map((r) => `${r.split('/')[0]}/*`)), ...repos],
		person: [
			'@me',
			'bots',
			...uniq([...items.map((i) => i.author), ...threads.map((t) => t.author)])
		],
		label: uniq([
			...items.flatMap((i) => i.labels.map((l) => l.name)),
			...threads.flatMap((t) => t.labels)
		]),
		source: uniq(settings?.sources.map((s) => s.name) ?? []),
		category: uniq(settings?.categories.map((c) => c.name) ?? []),
		tag: uniq(settings?.tags.map((t) => t.name) ?? [])
	};
}
