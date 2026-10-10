import { groupByOk } from './grouping';
import type { DashKind, DashSection, ItemView } from './types';

export const MAX_VIEWS = 12;
export const MAX_VIEW_SEARCHES = 5;
export const MAX_VIEW_NAME_CHARS = 40;
export const MAX_SEARCH_CHARS = 256;
export const MAX_SOURCE_COUNT_SEARCHES = 10;
export const SOURCE_RESULTS_MAX = 100;
const SORTS = /(?:^|\s)sort:/i;
export const newestFirst = (query: string) =>
	SORTS.test(query) ? query : `${query} sort:updated-desc`;

export interface SourceCount {
	pr: number | null;
	issue: number | null;
}

const SCOPING =
	/(?:^|\s)(?:author|assignee|mentions|commenter|involves|reviewed-by|review-requested|user-review-requested|team-review-requested|team|repo|org|user|project):\S/i;

export const searchIsUnscoped = (query: string) => !SCOPING.test(query);

export const DEFAULT_VIEWS: ItemView[] = [
	{
		id: 'mine',
		name: 'Mine',
		searches: [
			'is:pr is:open review-requested:@me',
			'is:open involves:@me',
			'is:pr is:open reviewed-by:@me -author:@me'
		],
		groupBy: 'role'
	}
];

const ONLY_PRS =
	/(?:^|\s)(?:is:pr|type:pr|is:merged|is:unmerged|draft:|review:|reviewed-by:|review-requested:|user-review-requested:|team-review-requested:|base:|head:)/i;
const ONLY_ISSUES = /(?:^|\s)(?:is:issue|type:issue)(?:\s|$)/i;
const NAMES_A_KIND = /(?:^|\s)(?:is:pr|is:issue|type:pr|type:issue)(?:\s|$)/i;
const DASH_KINDS: DashKind[] = ['pr', 'issue'];

export function searchKinds(query: string): DashKind[] {
	if (ONLY_ISSUES.test(query)) return ['issue'];
	if (ONLY_PRS.test(query)) return ['pr'];
	return DASH_KINDS;
}

export function viewKinds(view: Pick<ItemView, 'searches'>): DashKind[] {
	return DASH_KINDS.filter((kind) => view.searches.some((q) => searchKinds(q).includes(kind)));
}

const withKind = (kind: DashKind, query: string) =>
	NAMES_A_KIND.test(query) ? query : `is:${kind} ${query}`.trim();

export function sectionsFor(kind: DashKind, views: ItemView[]): DashSection[] {
	return views.flatMap((v) =>
		v.searches
			.filter((q) => searchKinds(q).includes(kind))
			.map((q) => ({ id: v.id, name: v.name, query: withKind(kind, q.trim()) }))
	);
}

function validateView(v: Partial<ItemView> | null, ids: Set<string>): string | null {
	if (typeof v?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v.id))
		return 'Each view needs a short id.';
	if (ids.has(v.id)) return `Two views use the id "${v.id}".`;
	ids.add(v.id);
	if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > MAX_VIEW_NAME_CHARS)
		return `Each view needs a name (${MAX_VIEW_NAME_CHARS} characters or fewer).`;
	if (!Array.isArray(v.searches) || !v.searches.length) return `"${v.name}": add a search.`;
	if (v.searches.length > MAX_VIEW_SEARCHES)
		return `"${v.name}": up to ${MAX_VIEW_SEARCHES} searches are allowed.`;
	for (const q of v.searches)
		if (typeof q !== 'string' || !q.trim() || q.length > MAX_SEARCH_CHARS)
			return `"${v.name}": each search must have 1–${MAX_SEARCH_CHARS} characters.`;
	if (!groupByOk(v.groupBy))
		return `"${v.name}": "groupBy" must be none, role, status, repo, author, label, assignee, category:<group id>, or project:<owner>/<number>.`;
	if (v.pushNew !== undefined && typeof v.pushNew !== 'boolean')
		return `"${v.name}": "pushNew" must be true or false.`;
	return null;
}

export function validateViews(views: unknown): string | null {
	if (!Array.isArray(views)) return 'Views must be a list.';
	if (!views.length) return 'Keep at least one view.';
	if (views.length > MAX_VIEWS) return `Up to ${MAX_VIEWS} views are allowed.`;
	const ids = new Set<string>();
	for (const v of views as ItemView[]) {
		const err = validateView(v, ids);
		if (err) return err;
	}
	return null;
}
