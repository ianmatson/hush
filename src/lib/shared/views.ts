import { allCategories } from './categories';
import { ruleMatches } from './classify';
import { compileExpr, exprMatches, queryError, type QueryExpr } from './query';
import type { Classification, RuleMatch, SavedView, Settings, ThreadDTO, ViewBase } from './types';

export const VIEW_BASES: { id: ViewBase; label: string }[] = [
	{ id: 'inbox', label: 'Needs you + FYI' },
	{ id: 'action', label: 'Needs you' },
	{ id: 'fyi', label: 'FYI' },
	{ id: 'snoozed', label: 'Snoozed' },
	{ id: 'done', label: 'Done' }
];
export const MAX_VIEWS = 12;

/** The built-in tabs that can be a feed, and their names. Notification views are 'v:<id>'. */
export const FEED_TABS: { id: string; label: string }[] = [
	{ id: 'action', label: 'Needs you' },
	{ id: 'fyi', label: 'FYI' },
	{ id: 'inbox', label: 'Needs you + FYI' }
];
const CATEGORY_FEED_VIEW = /^c:([a-z0-9-]{1,40})$/;

export const categoryFeedView = (id: string) => `c:${id}`;

export const parseCategoryFeed = (view: string): string | null =>
	CATEGORY_FEED_VIEW.exec(view)?.[1] ?? null;

export const feedViewOk = (view: string) =>
	FEED_TABS.some((t) => t.id === view) ||
	/^v:[a-z0-9]{1,16}$/.test(view) ||
	parseCategoryFeed(view) !== null;

export type MarkNames = Pick<Settings, 'categoryGroups'>;

/**
 * Does a thread match a query (a notification view, or the Filter box)? The words mean the same
 * as in rules; "in:" is the thread's list now (the view's base already picks it). "category:" is
 * its PR or issue's.
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

/** Validate notification views from the client. Returns an error message, or null. */
export function validateViews(views: unknown) {
	if (!Array.isArray(views)) return 'Views must be a list.';
	if (views.length > MAX_VIEWS) return `Up to ${MAX_VIEWS} views are allowed.`;
	const ids = new Set<string>();
	for (const v of views as SavedView[]) {
		if (typeof v?.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(v.id))
			return 'Each view needs an id.';
		if (ids.has(v.id)) return 'Two views have the same id.';
		ids.add(v.id);
		if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40)
			return 'Each view needs a name (40 characters or fewer).';
		if (!VIEW_BASES.some((b) => b.id === v.base)) return `"${v.name}": unknown base.`;
		const err = queryError(v.query);
		if (err) return `"${v.name}": ${typeof v.query === 'string' ? err : `"query" ${err}`}`;
	}
	return null;
}
