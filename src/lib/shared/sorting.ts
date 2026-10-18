import { sortItems, TURN_ORDER } from './dashboard';
import type { DashItem, ViewSort, ViewSortBy, ViewSortDir } from './types';

export const DEFAULT_VIEW_SORT: ViewSort = { by: 'turn', dir: 'asc', turnFirst: true };

type Compare = (a: DashItem, b: DashItem) => number;

const time = (s: string | null) => (s ? Date.parse(s) : 0);
const isPr = (i: DashItem) => i.kind === 'pr';
const size = (i: DashItem) => i.additions + i.deletions;

interface SortByInfo {
	label: string;
	naturalDir: ViewSortDir;
	ascLabel: string;
	descLabel: string;
	ascending: Compare;
	hasValue?: (i: DashItem) => boolean;
}

export const SORT_BY: Record<ViewSortBy, SortByInfo> = {
	turn: {
		label: 'Whose turn',
		naturalDir: 'asc',
		ascLabel: 'Your turn first',
		descLabel: 'Your turn last',
		ascending: () => 0
	},
	updated: {
		label: 'Updated',
		naturalDir: 'desc',
		ascLabel: 'Oldest first',
		descLabel: 'Newest first',
		ascending: (a, b) => time(a.updatedAt) - time(b.updatedAt)
	},
	created: {
		label: 'Created',
		naturalDir: 'desc',
		ascLabel: 'Oldest first',
		descLabel: 'Newest first',
		ascending: (a, b) => time(a.createdAt) - time(b.createdAt)
	},
	waiting: {
		label: 'Waiting since',
		naturalDir: 'asc',
		ascLabel: 'Longest wait first',
		descLabel: 'Shortest wait first',
		ascending: (a, b) => time(a.waitingSince) - time(b.waitingSince)
	},
	comments: {
		label: 'Comments',
		naturalDir: 'desc',
		ascLabel: 'Fewest first',
		descLabel: 'Most first',
		ascending: (a, b) => a.comments - b.comments
	},
	size: {
		label: 'Size',
		naturalDir: 'asc',
		ascLabel: 'Smallest first',
		descLabel: 'Largest first',
		ascending: (a, b) => size(a) - size(b),
		hasValue: isPr
	},
	title: {
		label: 'Title',
		naturalDir: 'asc',
		ascLabel: 'A to Z',
		descLabel: 'Z to A',
		ascending: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
	}
};

export const SORT_BY_ORDER = Object.keys(SORT_BY) as ViewSortBy[];

export const sortOfView = (v: { sort?: ViewSort }): ViewSort => v.sort ?? DEFAULT_VIEW_SORT;

export const isDefaultSort = (s: ViewSort) =>
	s.by === DEFAULT_VIEW_SORT.by && s.dir === DEFAULT_VIEW_SORT.dir;

export const dirLabel = (s: ViewSort) =>
	s.dir === 'asc' ? SORT_BY[s.by].ascLabel : SORT_BY[s.by].descLabel;

export const sortWithBy = (s: ViewSort, by: ViewSortBy): ViewSort => ({
	...s,
	by,
	dir: SORT_BY[by].naturalDir
});

export const reversedSort = (s: ViewSort): ViewSort => ({
	...s,
	dir: s.dir === 'asc' ? 'desc' : 'asc'
});

export const isSortBy = (v: unknown): v is ViewSortBy => typeof v === 'string' && v in SORT_BY;

export function viewSortError(v: unknown): string | null {
	if (typeof v !== 'object' || v === null) return '"sort" must be an object.';
	const s = v as Partial<ViewSort>;
	if (!isSortBy(s.by)) return `"sort.by" must be ${SORT_BY_ORDER.join(', ')}.`;
	if (s.dir !== 'asc' && s.dir !== 'desc') return '"sort.dir" must be asc or desc.';
	if (typeof s.turnFirst !== 'boolean') return '"sort.turnFirst" must be true or false.';
	return null;
}

export function sortItemsBy(items: DashItem[], s: ViewSort): DashItem[] {
	const turnOrdered = sortItems(items);
	if (s.by === 'turn') return s.dir === 'asc' ? turnOrdered : [...turnOrdered].reverse();
	const sign = s.dir === 'asc' ? 1 : -1;
	const byBand: Compare = (a, b) => (s.turnFirst ? TURN_ORDER[a.turn] - TURN_ORDER[b.turn] : 0);
	const { ascending, hasValue = () => true } = SORT_BY[s.by];
	const noValueLast: Compare = (a, b) => Number(!hasValue(a)) - Number(!hasValue(b));
	const byKey: Compare = (a, b) => (hasValue(a) && hasValue(b) ? sign * ascending(a, b) : 0);
	return [...turnOrdered].sort((a, b) => byBand(a, b) || noValueLast(a, b) || byKey(a, b));
}
