import { itemQueryFacts } from './categories';
import { queryMatches } from './rules';
import type { CategoryGroup, DashItem, DashProject, GroupBy, ViewSection } from './types';

export interface Section {
	key: string;
	label: string;
	items: DashItem[];
	color?: string;
}

export interface GroupContext {
	me: string;
	categoryGroups: CategoryGroup[];
	projects?: DashProject[];
	sections?: ViewSection[];
}

interface FixedGrouping {
	sections: { key: string; label: string }[];
	sectionOf: (i: DashItem, me: string) => string;
}

export const NOT_SORTED_SECTION = 'Not sorted';
export const NO_STATUS_SECTION = 'No status';
export const NOT_IN_PROJECT_SECTION = 'Not in project';
export const EVERYTHING_ELSE_SECTION = 'Everything else';
export const CUSTOM_GROUP_BY: GroupBy = 'custom';
const CATEGORY_PREFIX = 'category:';
const PROJECT_PREFIX = 'project:';
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
export const projectGroupBy = (projectKey: string): GroupBy => `${PROJECT_PREFIX}${projectKey}`;
export const projectKeyOf = (by: GroupBy) =>
	by.startsWith(PROJECT_PREFIX) ? by.slice(PROJECT_PREFIX.length) : null;
const projectLabel = (title: string) => `${title} status`;

const categoryGroupOf = (by: GroupBy, groups: CategoryGroup[]) =>
	by.startsWith(CATEGORY_PREFIX)
		? groups.find((g) => g.id === by.slice(CATEGORY_PREFIX.length))
		: undefined;

export type GroupByKind = 'basic' | 'field' | 'category' | 'project' | 'custom';

export interface GroupByOption {
	id: GroupBy;
	label: string;
	kind: GroupByKind;
}

export function projectsHolding(
	items: DashItem[],
	projects: DashProject[],
	keep: GroupBy
): DashProject[] {
	const count = new Map<string, number>();
	for (const i of items)
		for (const key of Object.keys(i.projectStatus ?? {})) count.set(key, (count.get(key) ?? 0) + 1);
	const kept = projectKeyOf(keep);
	return projects
		.filter((p) => count.has(p.key) || p.key === kept)
		.sort(
			(a, b) =>
				(count.get(b.key) ?? 0) - (count.get(a.key) ?? 0) ||
				a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
		);
}

export function groupByOptions(
	groups: CategoryGroup[],
	projects: DashProject[] = [],
	withCustom = false
): GroupByOption[] {
	return [
		...(withCustom
			? [{ id: CUSTOM_GROUP_BY, label: 'Custom sections', kind: 'custom' as const }]
			: []),
		{ id: 'none', label: 'None', kind: 'basic' },
		{ id: 'role', label: 'Your role', kind: 'basic' },
		{ id: 'status', label: 'Status', kind: 'basic' },
		...(Object.keys(FIELD_LABELS) as Field[]).map((id) => ({
			id,
			label: FIELD_LABELS[id],
			kind: 'field' as const
		})),
		...groups
			.filter((g) => g.categories.length)
			.map((g) => ({ id: categoryGroupBy(g.id), label: g.name, kind: 'category' as const })),
		...projects.map((p) => ({
			id: projectGroupBy(p.key),
			label: projectLabel(p.title),
			kind: 'project' as const
		}))
	];
}

export function groupByLabel(
	by: GroupBy,
	groups: CategoryGroup[],
	projects: DashProject[] = []
): string {
	const option = groupByOptions(groups, projects, true).find((o) => o.id === by);
	if (option) return option.label;
	const projectKey = projectKeyOf(by);
	return projectKey ? projectLabel(projectKey) : 'Status';
}

const VALID_GROUP_BY =
	/^(none|role|status|repo|author|label|assignee|custom|category:[a-z0-9-]{1,40}|project:[A-Za-z0-9-]{1,39}\/[1-9][0-9]{0,8})$/;
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

function projectSections(items: DashItem[], projectKey: string, project?: DashProject): Section[] {
	const statusSections = new Map<string, Section>(
		(project?.statuses ?? []).map((s) => [
			s.id,
			{ key: `status:${s.id}`, label: s.name, color: s.color, items: [] }
		])
	);
	const noStatus: Section = { key: NO_STATUS_SECTION, label: NO_STATUS_SECTION, items: [] };
	const notInProject: Section = {
		key: NOT_IN_PROJECT_SECTION,
		label: NOT_IN_PROJECT_SECTION,
		items: []
	};
	for (const i of items) {
		const status = i.projectStatus?.[projectKey];
		const inProject = status !== undefined;
		const section = inProject ? (statusSections.get(status ?? '') ?? noStatus) : notInProject;
		section.items.push(i);
	}
	return [...statusSections.values(), noStatus, notInProject].filter((s) => s.items.length);
}

function customSections(items: DashItem[], ctx: GroupContext): Section[] {
	const rules = ctx.sections ?? [];
	const named: Section[] = rules.map((s) => ({
		key: `custom:${s.name}`,
		label: s.name,
		items: []
	}));
	const rest: Section = { key: EVERYTHING_ELSE_SECTION, label: EVERYTHING_ELSE_SECTION, items: [] };
	for (const i of items) {
		const facts = itemQueryFacts(i, ctx.me, ctx);
		const k = rules.findIndex((s) => queryMatches(s.rule, facts));
		(k < 0 ? rest : named[k]).items.push(i);
	}
	return [...named, rest].filter((s) => s.items.length);
}

export function groupItems(items: DashItem[], by: GroupBy, ctx: GroupContext): Section[] {
	if (by === 'none') return items.length ? [{ key: 'all', label: '', items }] : [];
	if (by === CUSTOM_GROUP_BY) return customSections(items, ctx);
	if (by === 'role') return fixedSections(items, ROLE, ctx.me);
	if (by === 'status') return fixedSections(items, STATUS, ctx.me);
	if (by in FIELD_VALUE) return valueSections(items, by as Field);
	const projectKey = projectKeyOf(by);
	if (projectKey && ctx.projects)
		return projectSections(
			items,
			projectKey,
			ctx.projects.find((p) => p.key === projectKey)
		);
	const group = categoryGroupOf(by, ctx.categoryGroups);
	return group ? categorySections(items, group) : fixedSections(items, STATUS, ctx.me);
}
