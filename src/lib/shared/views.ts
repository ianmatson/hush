import { allCategories } from './categories';
import { ruleMatches } from './classify';
import { compileExpr, exprMatches, type QueryExpr } from './query';
import type { Classification, RuleMatch, Settings, ThreadDTO } from './types';

/** The built-in inbox tabs that can be a feed, and their names. Views are 'v:<id>'. */
export const FEED_TABS: { id: string; label: string }[] = [
	{ id: 'action', label: 'Needs you' },
	{ id: 'fyi', label: 'FYI' },
	{ id: 'inbox', label: 'Needs you + FYI' }
];
const CATEGORY_FEED_VIEW = /^c:([a-z0-9-]{1,40})$/;
const VIEW_FEED_VIEW = /^v:([a-z0-9-]{1,40})$/;

export const categoryFeedView = (id: string) => `c:${id}`;
export const viewFeedView = (id: string) => `v:${id}`;

export const parseCategoryFeed = (view: string): string | null =>
	CATEGORY_FEED_VIEW.exec(view)?.[1] ?? null;
export const parseViewFeed = (view: string): string | null =>
	VIEW_FEED_VIEW.exec(view)?.[1] ?? null;

export const feedViewOk = (view: string) =>
	FEED_TABS.some((t) => t.id === view) ||
	parseViewFeed(view) !== null ||
	parseCategoryFeed(view) !== null;

export type MarkNames = Pick<Settings, 'categoryGroups'>;

/**
 * Does a thread match a query (the inbox Filter box)? The words mean the same as in rules; "in:"
 * is the thread's list now. "category:" is its PR or issue's.
 */
export function threadMatches(
	query: string | RuleMatch,
	t: ThreadDTO,
	me: string,
	marks?: MarkNames
): boolean {
	const expr: QueryExpr =
		typeof query === 'string' ? compileExpr(query) : { kind: 'match', when: query };
	const c = { category: t.category, kind: t.kind } as Classification;
	const known = allCategories(marks?.categoryGroups ?? []);
	const itemCategories = (t.categories ?? []).map((id) => ({
		id,
		name: known.find((x) => x.id === id)?.name ?? id
	}));
	return exprMatches(expr, (when) =>
		ruleMatches(
			when,
			{
				repo: t.repo,
				subjectType: t.subjectType,
				title: t.title,
				reason: t.reason,
				htmlUrl: t.htmlUrl,
				me,
				activity: t.activity,
				itemCategories,
				enrichment: {
					kind: 'other',
					author: t.author ?? undefined,
					authorIsBot: t.authorIsBot,
					labels: t.labels,
					draft: t.draft,
					state: t.state ?? undefined,
					smart: t.smart
				}
			},
			c
		)
	);
}
