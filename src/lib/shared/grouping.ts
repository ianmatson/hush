import type { CategoryGroup, DashItem, GroupBy } from './types';

export interface Section {
	key: string;
	label: string;
	items: DashItem[];
}

export interface GroupContext {
	me: string;
	categoryGroups: CategoryGroup[];
}

interface FixedGrouping {
	sections: { key: string; label: string }[];
	sectionOf: (i: DashItem, me: string) => string;
}

export const NOT_SORTED_SECTION = 'Not sorted';
const CATEGORY_PREFIX = 'category:';
const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const ROLE: FixedGrouping = {
	sections: [
		{ key: 'opened', label: 'You opened' },
		{ key: 'reviews', label: 'Reviews' },
		{ key: 'assigned', label: 'Assigned to you' },
		{ key: 'involved', label: 'Involved' }
	],
	sectionOf(i, me) {
		if (sameLogin(i.author, me)) return 'opened';
		if (i.kind === 'pr' && (i.requestedMe || i.requestedTeams.length > 0 || i.myLastReviewAt))
			return 'reviews';
		if (i.assignees.some((a) => sameLogin(a, me))) return 'assigned';
		return 'involved';
	}
};

const STATUS: FixedGrouping = {
	sections: [
		{ key: 'no-review', label: 'No review yet' },
		{ key: 'in-review', label: 'In review' },
		{ key: 'changes', label: 'Changes requested' },
		{ key: 'approved', label: 'Approved' },
		{ key: 'drafts', label: 'Drafts' },
		{ key: 'unassigned', label: 'Unassigned' },
		{ key: 'assigned', label: 'Assigned' }
	],
	sectionOf(i) {
		if (i.kind === 'issue') return i.assignees.length ? 'assigned' : 'unassigned';
		if (i.draft) return 'drafts';
		if (i.reviewDecision === 'CHANGES_REQUESTED') return 'changes';
		if (i.reviewDecision === 'APPROVED') return 'approved';
		return i.reviewRequestCount > 0 || i.reviewed ? 'in-review' : 'no-review';
	}
};

const FIELD_LABELS = {
	repo: 'Repository',
	author: 'Author',
	label: 'Label',
	assignee: 'Assignee'
} as const;
type Field = keyof typeof FIELD_LABELS;

const FIELD_VALUE: Record<Field, (i: DashItem) => string> = {
	repo: (i) => i.repo,
	author: (i) => i.author,
	label: (i) => joined(i.labels.map((l) => l.name)),
	assignee: (i) => joined(i.assignees)
};

const NO_VALUE_LABEL: Record<Field, string> = {
	repo: 'No repository',
	author: 'No author',
	label: 'No labels',
	assignee: 'No assignee'
};

const joined = (values: string[]) =>
	[...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(', ');

export const categoryGroupBy = (groupId: string): GroupBy => `${CATEGORY_PREFIX}${groupId}`;

const categoryGroupOf = (by: GroupBy, groups: CategoryGroup[]) =>
	by.startsWith(CATEGORY_PREFIX)
		? groups.find((g) => g.id === by.slice(CATEGORY_PREFIX.length))
		: undefined;

export function groupByOptions(groups: CategoryGroup[]): { id: GroupBy; label: string }[] {
	return [
		{ id: 'none', label: 'None' },
		{ id: 'role', label: 'Your role' },
		{ id: 'status', label: 'Status' },
		...(Object.keys(FIELD_LABELS) as Field[]).map((id) => ({ id, label: FIELD_LABELS[id] })),
		...groups
			.filter((g) => g.categories.length)
			.map((g) => ({ id: categoryGroupBy(g.id), label: g.name }))
	];
}

export function groupByLabel(by: GroupBy, groups: CategoryGroup[]): string {
	return groupByOptions(groups).find((o) => o.id === by)?.label ?? 'Status';
}

const VALID_GROUP_BY = /^(none|role|status|repo|author|label|assignee|category:[a-z0-9-]{1,40})$/;
export const groupByOk = (v: unknown): v is GroupBy =>
	typeof v === 'string' && VALID_GROUP_BY.test(v);

function fixedSections(items: DashItem[], grouping: FixedGrouping, me: string): Section[] {
	const byKey = new Map<string, DashItem[]>();
	for (const i of items) {
		const key = grouping.sectionOf(i, me);
		byKey.set(key, [...(byKey.get(key) ?? []), i]);
	}
	return grouping.sections.flatMap((s) => {
		const list = byKey.get(s.key);
		return list ? [{ ...s, items: list }] : [];
	});
}

function valueSections(items: DashItem[], field: Field): Section[] {
	const byValue = new Map<string, DashItem[]>();
	for (const i of items) {
		const v = FIELD_VALUE[field](i);
		byValue.set(v, [...(byValue.get(v) ?? []), i]);
	}
	const valueOrderLast = (v: string) => (v ? 0 : 1);
	return [...byValue.entries()]
		.sort(
			([a], [b]) =>
				valueOrderLast(a) - valueOrderLast(b) ||
				a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
		.map(([v, list]) => ({
			key: v || NO_VALUE_LABEL[field],
			label: v || NO_VALUE_LABEL[field],
			items: list
		}));
}

function categorySections(items: DashItem[], group: CategoryGroup): Section[] {
	const sections: Section[] = group.categories.map((c) => ({
		key: c.id,
		label: c.name,
		items: items.filter((i) => i.categories?.includes(c.id))
	}));
	const placed = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
	sections.push({
		key: NOT_SORTED_SECTION,
		label: NOT_SORTED_SECTION,
		items: items.filter((i) => !placed.has(i.id))
	});
	return sections.filter((s) => s.items.length);
}

export function groupItems(items: DashItem[], by: GroupBy, ctx: GroupContext): Section[] {
	if (by === 'none') return items.length ? [{ key: 'all', label: '', items }] : [];
	if (by === 'role') return fixedSections(items, ROLE, ctx.me);
	if (by === 'status') return fixedSections(items, STATUS, ctx.me);
	if (by in FIELD_VALUE) return valueSections(items, by as Field);
	const group = categoryGroupOf(by, ctx.categoryGroups);
	return group ? categorySections(items, group) : fixedSections(items, STATUS, ctx.me);
}
