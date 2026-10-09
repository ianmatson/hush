import { queryMatches } from './classify';
import { conditionId, cyrb53, type DecisionChoice } from './decisions';
import { queryError, usesItemMarks, usesNotificationWords } from './query';
import { parseMarkIcon } from './mark-icons';
import type {
	CategoryGroup,
	Classification,
	DashItem,
	ItemCategory,
	MarkColor,
	Settings,
	ThreadFacts
} from './types';

export const MAX_CATEGORY_GROUPS = 10;
export const MAX_CATEGORIES = 20;
export const MAX_DESCRIPTION_CHARS = 200;
export const MAX_MARK_NAME_CHARS = 40;

export const MARK_COLORS: MarkColor[] = [
	'gray',
	'red',
	'orange',
	'amber',
	'green',
	'teal',
	'blue',
	'violet',
	'pink'
];

export const DEFAULT_CATEGORY_GROUPS: CategoryGroup[] = [
	{
		id: 'effort',
		name: 'Effort',
		multiple: false,
		categories: [
			{
				id: 'low-effort',
				name: 'Low',
				color: 'green',
				icon: 'lucide:timer',
				rule: '',
				description:
					'A pull request that takes minutes to review, or an issue that takes an hour or less to do'
			},
			{
				id: 'medium-effort',
				name: 'Medium',
				color: 'amber',
				icon: 'lucide:clock',
				rule: '',
				description:
					'A pull request that takes up to an hour to review, or an issue that takes up to a day to do'
			},
			{
				id: 'high-effort',
				name: 'High',
				color: 'red',
				icon: 'lucide:calendar-clock',
				rule: '',
				description:
					'A pull request that takes more than an hour to review, or an issue that takes more than a day to do'
			}
		]
	},
	{
		id: 'impact',
		name: 'Impact',
		multiple: false,
		categories: [
			{
				id: 'low-impact',
				name: 'Low',
				color: 'gray',
				icon: 'lucide:minus',
				rule: '',
				description:
					'A fix or feature that few people notice, such as a small edge case, internal cleanup, or a minor tweak'
			},
			{
				id: 'medium-impact',
				name: 'Medium',
				color: 'blue',
				icon: 'lucide:chevron-up',
				rule: '',
				description:
					'A fix or feature that some users or teams notice, such as a bug in one workflow or an improvement to one part of the product'
			},
			{
				id: 'high-impact',
				name: 'High',
				color: 'violet',
				icon: 'lucide:chevrons-up',
				rule: '',
				description:
					'A fix or feature that many users notice, such as an outage, data loss, a security hole, a broken core flow, or a major new capability'
			}
		]
	}
];

export interface ItemPins {
	on: string[];
	off: string[];
}

export const NO_PINS: ItemPins = { on: [], off: [] };

export type PinChange =
	{ category: string; state: 'on' | 'off' } | { group: string; state: 'auto' };

export const allCategories = (groups: CategoryGroup[]) => groups.flatMap((g) => g.categories);

export const groupOf = (groups: CategoryGroup[], categoryId: string) =>
	groups.find((g) => g.categories.some((c) => c.id === categoryId));

const described = (g: CategoryGroup) => g.categories.filter((c) => c.description.trim());

export function groupChoice(g: CategoryGroup): DecisionChoice | null {
	if (g.multiple) return null;
	const options = Object.fromEntries(
		described(g).map((c) => [c.id, `${c.name}: ${c.description}`])
	);
	if (!Object.keys(options).length) return null;
	return { key: cyrb53(JSON.stringify(options)), options };
}

export const groupChoices = (groups: CategoryGroup[]) =>
	groups.flatMap((g) => groupChoice(g) ?? []);

export const categoryConditionText = (c: ItemCategory) => `${c.name}: ${c.description}`;

export const categoryConditionTexts = (groups: CategoryGroup[]) =>
	groups.filter((g) => g.multiple).flatMap((g) => described(g).map(categoryConditionText));

const usableRules = new Map<string, boolean>();

export function ruleUsable(rule: string): boolean {
	let ok = usableRules.get(rule);
	if (ok === undefined) {
		ok = !!rule.trim() && !queryError(rule) && !usesNotificationWords(rule) && !usesItemMarks(rule);
		usableRules.set(rule, ok);
	}
	return ok;
}

function placeInGroup(
	g: CategoryGroup,
	t: ThreadFacts,
	c: Classification,
	pins: ItemPins
): string[] {
	const pinnedOn = g.categories.filter((x) => pins.on.includes(x.id));
	const open = g.categories.filter((x) => !pins.on.includes(x.id) && !pins.off.includes(x.id));
	const byRule = (x: ItemCategory) => ruleUsable(x.rule) && queryMatches(x.rule, t, c);
	if (g.multiple) {
		const smart = t.enrichment?.smart ?? [];
		const byJev = (x: ItemCategory) =>
			!!x.description.trim() && smart.includes(conditionId(categoryConditionText(x)));
		const placed = new Set([...pinnedOn, ...open.filter((x) => byRule(x) || byJev(x))]);
		return g.categories.filter((x) => placed.has(x)).map((x) => x.id);
	}
	if (pinnedOn.length) return [pinnedOn[0].id];
	const ruled = open.find(byRule);
	if (ruled) return [ruled.id];
	const choice = groupChoice(g);
	const chosen = choice ? t.enrichment?.jevChoices?.[choice.key] : undefined;
	return open.some((x) => x.id === chosen) ? [chosen!] : [];
}

export function pinsAfter(
	pins: ItemPins,
	change: PinChange,
	groups: CategoryGroup[]
): ItemPins | null {
	const group =
		'group' in change
			? groups.find((g) => g.id === change.group)
			: groupOf(groups, change.category);
	if (!group) return null;
	const inGroup = new Set(group.categories.map((c) => c.id));
	const cleared = (id: string) =>
		'group' in change || !group.multiple ? inGroup.has(id) : id === change.category;
	const on = pins.on.filter((id) => !cleared(id));
	const off = pins.off.filter((id) => !cleared(id));
	if ('category' in change) (change.state === 'on' ? on : off).push(change.category);
	return { on, off };
}

export interface Placement {
	categories: string[];
	pinned: string[];
}

export function placeItem(
	t: ThreadFacts,
	c: Classification,
	pins: ItemPins | undefined,
	groups: CategoryGroup[]
): Placement {
	const p = pins ?? NO_PINS;
	const ids = new Set(allCategories(groups).map((x) => x.id));
	return {
		categories: groups.flatMap((g) => placeInGroup(g, t, c, p)),
		pinned: [...p.on, ...p.off].filter((id) => ids.has(id))
	};
}

export function itemQueryFacts(
	i: DashItem,
	me: string,
	settings: Pick<Settings, 'categoryGroups' | 'sources'>
): ThreadFacts {
	const sourceNames = new Map(settings.sources.map((s) => [s.id, s.name]));
	return {
		repo: i.repo,
		subjectType: i.kind === 'pr' ? 'PullRequest' : 'Issue',
		title: i.title,
		reason: '',
		htmlUrl: i.url,
		me,
		enrichment: {
			kind: i.kind,
			author: i.author,
			authorIsBot: i.authorIsBot,
			labels: i.labels.map((l) => l.name),
			draft: i.draft,
			state: i.state,
			assignees: i.assignees,
			reviewRequests: [...(i.requestedMe ? [me] : []), ...i.requestedTeams],
			additions: i.kind === 'pr' ? i.additions : undefined,
			deletions: i.kind === 'pr' ? i.deletions : undefined
		},
		activity: i.lastCommentBy
			? {
					by: i.lastCommentBy,
					bot: i.lastCommentIsBot,
					what: 'commented',
					at: i.lastCommentAt ?? i.updatedAt
				}
			: null,
		sources: i.sections.map((id) => sourceNames.get(id) ?? id),
		itemCategories: allCategories(settings.categoryGroups)
			.filter((c) => i.categories?.includes(c.id))
			.map((c) => ({ id: c.id, name: c.name }))
	};
}

export const markQueries = (settings: Pick<Settings, 'categoryGroups'>) =>
	allCategories(settings.categoryGroups).map((c) => c.rule);

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

const validName = (name: unknown) =>
	typeof name === 'string' && !!name.trim() && name.length <= MAX_MARK_NAME_CHARS;

function validateCategory(c: Partial<ItemCategory> | null, ids: Set<string>): string | null {
	if (typeof c?.id !== 'string' || !ID_PATTERN.test(c.id)) return 'Each category needs a short id.';
	if (ids.has(c.id)) return `Two categories use the id "${c.id}".`;
	ids.add(c.id);
	if (!validName(c.name))
		return `Each category needs a name (${MAX_MARK_NAME_CHARS} characters or fewer).`;
	if (!MARK_COLORS.includes(c.color as MarkColor)) return `"${c.name}": unknown colour.`;
	if (typeof c.rule !== 'string') return `"${c.name}": the rule must be text.`;
	const err = c.rule.trim() ? queryError(c.rule) : null;
	if (err) return `"${c.name}": ${err}`;
	if (usesItemMarks(c.rule)) return `"${c.name}": rules cannot use category:.`;
	if (usesNotificationWords(c.rule))
		return `"${c.name}": rules look at the PR or issue, so they cannot use event:, needs:, or in:.`;
	if (typeof c.description !== 'string' || c.description.length > MAX_DESCRIPTION_CHARS)
		return `"${c.name}": the description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`;
	if (c.icon !== undefined && !parseMarkIcon(c.icon))
		return `"${c.name}": "icon" must be "lucide:<name>" from the icon list, or one emoji.`;
	return null;
}

function validateGroup(
	g: Partial<CategoryGroup> | null,
	groupIds: Set<string>,
	categoryIds: Set<string>
): string | null {
	if (typeof g?.id !== 'string' || !ID_PATTERN.test(g.id))
		return 'Each category group needs a short id.';
	if (groupIds.has(g.id)) return `Two category groups use the id "${g.id}".`;
	groupIds.add(g.id);
	if (!validName(g.name))
		return `Each category group needs a name (${MAX_MARK_NAME_CHARS} characters or fewer).`;
	if (typeof g.multiple !== 'boolean') return `"${g.name}": "multiple" must be true or false.`;
	if (!Array.isArray(g.categories)) return `"${g.name}": categories must be a list.`;
	if (g.categories.length > MAX_CATEGORIES)
		return `"${g.name}": up to ${MAX_CATEGORIES} categories are allowed.`;
	for (const c of g.categories) {
		const err = validateCategory(c, categoryIds);
		if (err) return err;
	}
	return null;
}

export function validateCategoryGroups(groups: unknown): string | null {
	if (!Array.isArray(groups)) return 'Category groups must be a list.';
	if (groups.length > MAX_CATEGORY_GROUPS)
		return `Up to ${MAX_CATEGORY_GROUPS} category groups are allowed.`;
	const groupIds = new Set<string>();
	const categoryIds = new Set<string>();
	for (const g of groups as CategoryGroup[]) {
		const err = validateGroup(g, groupIds, categoryIds);
		if (err) return err;
	}
	return null;
}
