import { CUSTOM_GROUP_BY, EVERYTHING_ELSE_SECTION, groupByOk } from './grouping';
import { queryError, resolveToday, splitSearch } from './query';
import { queryMatches } from './rules';
import type { DashKind, DashSection, ItemView, RuleFacts } from './types';

export const MAX_VIEWS = 12;
export const MAX_VIEW_SEARCHES = 5;
export const MAX_VIEW_NAME_CHARS = 40;
export const MAX_SEARCH_CHARS = 256;
export const MAX_SOURCE_COUNT_SEARCHES = 10;
export const MAX_VIEW_SECTIONS = 10;
export const MAX_SECTION_NAME_CHARS = 40;
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

export const searchIsUnscoped = (query: string) => !SCOPING.test(splitSearch(query).github);

export const githubSearchOf = (query: string, now = Date.now()) =>
	resolveToday(splitSearch(query).github, now);

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
	/(?:^|\s)(?:is:pr|type:pr|is:merged|is:unmerged|draft:|review:|reviewed-by:|review-requested:|user-review-requested:|team-review-requested:|base:|head:|size:)/i;
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

export function sectionsFor(kind: DashKind, views: ItemView[], now = Date.now()): DashSection[] {
	return views.flatMap((v) =>
		v.searches
			.filter((q) => searchKinds(q).includes(kind))
			.map((q) => {
				const { hush } = splitSearch(q);
				return {
					id: v.id,
					name: v.name,
					query: withKind(kind, githubSearchOf(q, now)),
					...(hush && { filter: hush })
				};
			})
	);
}

export function viewsPassingFilters(
	viewIds: string[],
	filtersByView: Map<string, Set<string>>,
	facts: RuleFacts
): Set<string> {
	const passes = (filter: string) => !filter || queryMatches(filter, facts);
	return new Set(viewIds.filter((id) => [...(filtersByView.get(id) ?? [''])].some(passes)));
}

function sectionsError(v: Partial<ItemView>, checkRules: boolean): string | null {
	const needsSections = v.groupBy === CUSTOM_GROUP_BY;
	if (v.sections === undefined)
		return needsSections ? `"${v.name}": add a section, or choose another Group by.` : null;
	if (!Array.isArray(v.sections)) return `"${v.name}": "sections" must be a list.`;
	if (needsSections && !v.sections.length)
		return `"${v.name}": add a section, or choose another Group by.`;
	if (v.sections.length > MAX_VIEW_SECTIONS)
		return `"${v.name}": up to ${MAX_VIEW_SECTIONS} sections are allowed.`;
	const names = new Set<string>();
	for (const s of v.sections) {
		if (typeof s?.name !== 'string' || !s.name.trim() || s.name.length > MAX_SECTION_NAME_CHARS)
			return `"${v.name}": each section needs a name (${MAX_SECTION_NAME_CHARS} characters or fewer).`;
		const name = s.name.trim().toLowerCase();
		if (name === EVERYTHING_ELSE_SECTION.toLowerCase())
			return `"${v.name}": "${EVERYTHING_ELSE_SECTION}" is always the last section. Give this one another name.`;
		if (names.has(name)) return `"${v.name}": two sections are named "${s.name}".`;
		names.add(name);
		if (typeof s.rule !== 'string' || !s.rule.trim())
			return `"${v.name}": the section "${s.name}" needs a rule.`;
		const err = checkRules ? queryError(s.rule, 'section') : null;
		if (err) return `"${v.name}", section "${s.name}": ${err}`;
	}
	return null;
}

function validateView(
	v: Partial<ItemView> | null,
	ids: Set<string>,
	checkSearches: boolean
): string | null {
	if (typeof v?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v.id))
		return 'Each view needs a short id.';
	if (ids.has(v.id)) return `Two views use the id "${v.id}".`;
	ids.add(v.id);
	if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > MAX_VIEW_NAME_CHARS)
		return `Each view needs a name (${MAX_VIEW_NAME_CHARS} characters or fewer).`;
	if (!Array.isArray(v.searches) || !v.searches.length) return `"${v.name}": add a search.`;
	if (v.searches.length > MAX_VIEW_SEARCHES)
		return `"${v.name}": up to ${MAX_VIEW_SEARCHES} searches are allowed.`;
	for (const q of v.searches) {
		if (typeof q !== 'string' || !q.trim() || q.length > MAX_SEARCH_CHARS)
			return `"${v.name}": each search must have 1–${MAX_SEARCH_CHARS} characters.`;
		const err = checkSearches ? queryError(q, 'search') : null;
		if (err) return `"${v.name}": ${err}`;
	}
	if (!groupByOk(v.groupBy))
		return `"${v.name}": "groupBy" must be none, role, status, repo, author, label, assignee, custom, category:<group id>, or project:<owner>/<number>.`;
	const sectionsErr = sectionsError(v, checkSearches);
	if (sectionsErr) return sectionsErr;
	if (v.pushNew !== undefined && typeof v.pushNew !== 'boolean')
		return `"${v.name}": "pushNew" must be true or false.`;
	return null;
}

export function validateViews(views: unknown, checkSearches = true): string | null {
	if (!Array.isArray(views)) return 'Views must be a list.';
	if (!views.length) return 'Keep at least one view.';
	if (views.length > MAX_VIEWS) return `Up to ${MAX_VIEWS} views are allowed.`;
	const ids = new Set<string>();
	for (const v of views as ItemView[]) {
		const err = validateView(v, ids, checkSearches);
		if (err) return err;
	}
	return null;
}
