import { queryMatches } from './classify';
import type { CategoryOption } from './decisions';
import { aboutTexts, queryError, usesItemMarks } from './query';
import { parseMarkIcon } from './mark-icons';
import type {
	CategoryInbox,
	CategoryPush,
	CategoryTriage,
	Classification,
	DashItem,
	ItemCategory,
	LegacyInboxRule,
	ItemTag,
	MarkColor,
	Settings,
	ThreadFacts
} from './types';

export const FALLBACK_CATEGORY_ID = 'other';
export const MAX_CATEGORIES = 20;
export const MAX_TAGS = 20;
export const MAX_DESCRIPTION_CHARS = 200;
export const MAX_MARK_NAME_CHARS = 40;

export const MAX_SNOOZE_HOURS = 30 * 24;
export const DEFAULT_SNOOZE_HOURS = 24;

export const CATEGORY_INBOX_OPTIONS: { id: CategoryInbox; label: string }[] = [
	{ id: 'auto', label: 'Hush decides' },
	{ id: 'action', label: 'Always Needs you' },
	{ id: 'fyi', label: 'Always FYI' },
	{ id: 'muted', label: 'Muted' }
];

export const CATEGORY_PUSH_OPTIONS: { id: CategoryPush; label: string }[] = [
	{ id: 'inherit', label: 'Use the notification settings' },
	{ id: 'on', label: 'Always push' },
	{ id: 'off', label: 'Never push' }
];

export const CATEGORY_TRIAGE_OPTIONS: { id: CategoryTriage | 'none'; label: string }[] = [
	{ id: 'none', label: 'Keep in the inbox' },
	{ id: 'done', label: 'Move to Done' },
	{ id: 'snooze', label: 'Snooze' }
];

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

export const DEFAULT_CATEGORIES: ItemCategory[] = [
	{
		id: 'incidents',
		name: 'Incidents',
		color: 'red',
		icon: 'lucide:siren',
		rule: '',
		description: 'Production problems, outages, reverts, and urgent fixes'
	},
	{
		id: 'features',
		name: 'Features',
		color: 'blue',
		icon: 'lucide:sparkles',
		rule: '',
		description: 'New behaviour or product changes'
	},
	{
		id: 'bugs',
		name: 'Bugs',
		color: 'orange',
		icon: 'lucide:bug',
		rule: '',
		description: 'Defects and their fixes'
	},
	{
		id: 'maintenance',
		name: 'Maintenance',
		color: 'teal',
		icon: 'lucide:wrench',
		rule: 'author:bots',
		description: 'Dependency updates, CI, refactors, tests, docs, and chores'
	},
	{ id: FALLBACK_CATEGORY_ID, name: 'Other', color: 'gray', rule: '', description: '' }
];

export const DEFAULT_TAGS: ItemTag[] = [
	{
		id: 'blocked',
		name: 'Blocked',
		color: 'amber',
		rule: 'about:"It waits on something outside the control of its author"'
	},
	{
		id: 'needs-decision',
		name: 'Needs decision',
		color: 'violet',
		rule: 'about:"It asks for a choice between options before the work can go on"'
	},
	{
		id: 'security',
		name: 'Security',
		color: 'red',
		rule: 'about:"Vulnerabilities, secrets, permissions, or authentication"'
	},
	{
		id: 'breaking',
		name: 'Breaking change',
		color: 'pink',
		rule: 'about:"It changes behaviour that other code or users depend on"'
	},
	{ id: 'quick', name: 'Quick', color: 'green', rule: 'type:pr size:<50' }
];

export interface ItemPins {
	category?: string | null;
	tagsOn?: string[];
	tagsOff?: string[];
}

export type PlacedBy = 'pin' | 'rule' | 'jev' | 'fallback';

export interface Placement {
	category: string;
	categoryBy: PlacedBy;
	tags: string[];
}

export const choosableCategories = (categories: ItemCategory[]) =>
	categories.filter((c) => c.id !== FALLBACK_CATEGORY_ID && c.description.trim());

function placeCategory(
	t: ThreadFacts,
	c: Classification,
	jevCategory: string | null,
	pinned: string | null | undefined,
	categories: ItemCategory[]
): [string, PlacedBy] {
	if (pinned && categories.some((x) => x.id === pinned)) return [pinned, 'pin'];
	const byRule = categories.find(
		(x) => x.id !== FALLBACK_CATEGORY_ID && x.rule.trim() && queryMatches(x.rule, t, c)
	);
	if (byRule) return [byRule.id, 'rule'];
	const byJev = choosableCategories(categories).find((x) => x.id === jevCategory);
	if (byJev) return [byJev.id, 'jev'];
	return [FALLBACK_CATEGORY_ID, 'fallback'];
}

export function placeItem(
	t: ThreadFacts,
	c: Classification,
	jevCategory: string | null,
	pins: ItemPins | undefined,
	settings: Pick<Settings, 'categories' | 'tags'>
): Placement {
	const [category, categoryBy] = placeCategory(
		t,
		c,
		jevCategory,
		pins?.category,
		settings.categories
	);
	const tagIds = new Set(settings.tags.map((x) => x.id));
	const on = new Set((pins?.tagsOn ?? []).filter((id) => tagIds.has(id)));
	const off = new Set(pins?.tagsOff ?? []);
	const tags = settings.tags
		.filter((x) => on.has(x.id) || (!off.has(x.id) && x.rule.trim() && queryMatches(x.rule, t, c)))
		.map((x) => x.id);
	return { category, categoryBy, tags };
}

export function threadCategory(
	t: ThreadFacts,
	base: Classification,
	categories: ItemCategory[]
): ItemCategory | undefined {
	const [id] = placeCategory(
		t,
		base,
		t.enrichment?.jevCategory ?? null,
		t.pinnedCategory,
		categories
	);
	return categories.find((x) => x.id === id);
}

const changesInbox = (c: ItemCategory) =>
	(c.inbox ?? 'auto') !== 'auto' || (c.push ?? 'inherit') !== 'inherit' || !!c.triage;

export function withCategory(base: Classification, category: ItemCategory | undefined) {
	if (!category || !changesInbox(category)) return base;
	const inbox = category.inbox ?? 'auto';
	const push = category.push ?? 'inherit';
	return {
		...base,
		category: inbox === 'auto' ? base.category : inbox,
		push: push === 'inherit' ? undefined : push === 'on',
		triage: category.triage,
		snoozeHours: category.triage === 'snooze' ? category.snoozeHours : undefined,
		rule: category.name
	};
}

const legacyRuleName = (r: LegacyInboxRule, n: number) => r.name?.trim() || `Rule ${n + 1}`;

function categoryFromLegacyRule(r: LegacyInboxRule, n: number, used: Set<string>): ItemCategory {
	let id = `rule-${n + 1}`;
	for (let k = 2; used.has(id); k++) id = `rule-${n + 1}-${k}`;
	used.add(id);
	return {
		id,
		name: legacyRuleName(r, n).slice(0, MAX_MARK_NAME_CHARS),
		color: 'gray',
		rule: r.when ?? '',
		description: '',
		inbox: r.then.category ?? 'auto',
		push: r.then.push === undefined ? 'inherit' : r.then.push ? 'on' : 'off',
		...(r.then.triage ? { triage: r.then.triage } : {}),
		...(r.then.triage === 'snooze'
			? { snoozeHours: r.then.snoozeHours ?? DEFAULT_SNOOZE_HOURS }
			: {})
	};
}

export function categoriesWithLegacyRules(
	categories: ItemCategory[],
	rules: LegacyInboxRule[]
): ItemCategory[] {
	const used = new Set(categories.map((c) => c.id));
	const enabled = rules
		.map((r, n) => ({ r, n }))
		.filter(({ r }) => r?.enabled !== false && r?.then && typeof r.when === 'string');
	const everyThread = enabled.find(({ r }) => !r.when.trim());
	const withQueries = enabled
		.filter(({ r }) => r.when.trim())
		.slice(0, Math.max(0, MAX_CATEGORIES - categories.length))
		.map(({ r, n }) => categoryFromLegacyRule(r, n, used));
	const fallback = (c: ItemCategory) => {
		if (!everyThread || c.id !== FALLBACK_CATEGORY_ID || changesInbox(c)) return c;
		const { inbox, push, triage, snoozeHours } = categoryFromLegacyRule(
			everyThread.r,
			everyThread.n,
			new Set()
		);
		return { ...c, inbox, push, triage, snoozeHours };
	};
	return [...withQueries, ...categories.map(fallback)];
}

export function categoryChoiceOptions(categories: ItemCategory[]): CategoryOption[] {
	const choosable = choosableCategories(categories);
	if (!choosable.length) return [];
	return [
		...choosable.map((c) => ({ id: c.id, label: `${c.name}: ${c.description}` })),
		{ id: FALLBACK_CATEGORY_ID, label: 'None of these' }
	];
}

export function itemQueryFacts(
	i: DashItem,
	me: string,
	settings: Pick<Settings, 'categories' | 'tags' | 'sources'>
): ThreadFacts {
	const category = settings.categories.find((c) => c.id === i.category);
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
		itemCategory: category ? { id: category.id, name: category.name } : undefined,
		itemTags: settings.tags
			.filter((t) => i.tags?.includes(t.id))
			.map((t) => ({ id: t.id, name: t.name }))
	};
}

export const markQueries = (settings: Pick<Settings, 'categories' | 'tags'>) => [
	...settings.categories.filter((c) => c.id !== FALLBACK_CATEGORY_ID).map((c) => c.rule),
	...settings.tags.map((t) => t.rule)
];

export const markAboutTexts = (settings: Pick<Settings, 'categories' | 'tags'>) =>
	markQueries(settings).flatMap(aboutTexts);

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

function validateMark(
	m: Partial<ItemCategory & ItemTag> | null,
	what: { one: string; many: string },
	ids: Set<string>
): string | null {
	if (typeof m?.id !== 'string' || !ID_PATTERN.test(m.id))
		return `Each ${what.one} needs a short id.`;
	if (ids.has(m.id)) return `Two ${what.many} use the id "${m.id}".`;
	ids.add(m.id);
	if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > MAX_MARK_NAME_CHARS)
		return `Each ${what.one} needs a name (${MAX_MARK_NAME_CHARS} characters or fewer).`;
	if (!MARK_COLORS.includes(m.color as MarkColor)) return `"${m.name}": unknown colour.`;
	if (typeof m.rule !== 'string') return `"${m.name}": the rule must be text.`;
	const err = m.rule.trim() ? queryError(m.rule) : null;
	if (err) return `"${m.name}": ${err}`;
	if (usesItemMarks(m.rule)) return `"${m.name}": rules cannot use category: or tag:.`;
	return null;
}

export function validateCategories(categories: unknown): string | null {
	if (!Array.isArray(categories)) return 'Categories must be a list.';
	if (categories.length > MAX_CATEGORIES) return `Up to ${MAX_CATEGORIES} categories are allowed.`;
	const ids = new Set<string>();
	for (const c of categories as ItemCategory[]) {
		const err =
			validateMark(c, { one: 'category', many: 'categories' }, ids) ??
			validateDescription(c) ??
			validateIcon(c) ??
			validateCategoryInbox(c);
		if (err) return err;
	}
	if (!ids.has(FALLBACK_CATEGORY_ID))
		return `The fallback category ("${FALLBACK_CATEGORY_ID}") cannot be deleted.`;
	return null;
}

function validateDescription(c: ItemCategory): string | null {
	if (typeof c.description !== 'string' || c.description.length > MAX_DESCRIPTION_CHARS)
		return `"${c.name}": the description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`;
	return null;
}

function validateIcon(c: ItemCategory): string | null {
	if (c.icon === undefined || parseMarkIcon(c.icon)) return null;
	return `"${c.name}": "icon" must be "lucide:<name>" from the icon list, or one emoji.`;
}

function validateCategoryInbox(c: ItemCategory): string | null {
	if (c.inbox !== undefined && !CATEGORY_INBOX_OPTIONS.some((o) => o.id === c.inbox))
		return `"${c.name}": "inbox" must be "auto", "action", "fyi", or "muted".`;
	if (c.push !== undefined && !CATEGORY_PUSH_OPTIONS.some((o) => o.id === c.push))
		return `"${c.name}": "push" must be "inherit", "on", or "off".`;
	if (c.triage !== undefined && c.triage !== 'done' && c.triage !== 'snooze')
		return `"${c.name}": "triage" must be "done" or "snooze".`;
	if (
		c.triage === 'snooze' &&
		!(Number.isInteger(c.snoozeHours) && c.snoozeHours! >= 1 && c.snoozeHours! <= MAX_SNOOZE_HOURS)
	)
		return `"${c.name}": "snoozeHours" must be a whole number of hours from 1 to ${MAX_SNOOZE_HOURS}.`;
	return null;
}

export function validateTags(tags: unknown): string | null {
	if (!Array.isArray(tags)) return 'Tags must be a list.';
	if (tags.length > MAX_TAGS) return `Up to ${MAX_TAGS} tags are allowed.`;
	const ids = new Set<string>();
	for (const t of tags as ItemTag[]) {
		const err = validateMark(t, { one: 'tag', many: 'tags' }, ids);
		if (err) return err;
	}
	return null;
}
