import { queryMatches } from './classify';
import type { CategoryOption } from './decisions';
import { aboutTexts, queryError } from './query';
import type {
	Classification,
	ItemCategory,
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
		rule: '',
		description: 'Production problems, outages, reverts, and urgent fixes'
	},
	{
		id: 'features',
		name: 'Features',
		color: 'blue',
		rule: '',
		description: 'New behaviour or product changes'
	},
	{ id: 'bugs', name: 'Bugs', color: 'orange', rule: '', description: 'Defects and their fixes' },
	{
		id: 'maintenance',
		name: 'Maintenance',
		color: 'teal',
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

export function placeItem(
	t: ThreadFacts,
	c: Classification,
	jevCategory: string | null,
	pins: ItemPins | undefined,
	settings: Pick<Settings, 'categories' | 'tags'>
): Placement {
	const known = new Set(settings.categories.map((x) => x.id));
	const pinned = pins?.category;
	const byRule = settings.categories.find(
		(x) => x.id !== FALLBACK_CATEGORY_ID && x.rule.trim() && queryMatches(x.rule, t, c)
	);
	const byJev = choosableCategories(settings.categories).find((x) => x.id === jevCategory);
	const [category, categoryBy]: [string, PlacedBy] =
		pinned && known.has(pinned)
			? [pinned, 'pin']
			: byRule
				? [byRule.id, 'rule']
				: byJev
					? [byJev.id, 'jev']
					: [FALLBACK_CATEGORY_ID, 'fallback'];
	const tagIds = new Set(settings.tags.map((x) => x.id));
	const on = new Set((pins?.tagsOn ?? []).filter((id) => tagIds.has(id)));
	const off = new Set(pins?.tagsOff ?? []);
	const tags = settings.tags
		.filter((x) => on.has(x.id) || (!off.has(x.id) && x.rule.trim() && queryMatches(x.rule, t, c)))
		.map((x) => x.id);
	return { category, categoryBy, tags };
}

export function categoryChoiceOptions(categories: ItemCategory[]): CategoryOption[] {
	const choosable = choosableCategories(categories);
	if (!choosable.length) return [];
	return [
		...choosable.map((c) => ({ id: c.id, label: `${c.name}: ${c.description}` })),
		{ id: FALLBACK_CATEGORY_ID, label: 'None of these' }
	];
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
	return null;
}

export function validateCategories(categories: unknown): string | null {
	if (!Array.isArray(categories)) return 'Categories must be a list.';
	if (categories.length > MAX_CATEGORIES) return `Up to ${MAX_CATEGORIES} categories are allowed.`;
	const ids = new Set<string>();
	for (const c of categories as ItemCategory[]) {
		const err = validateMark(c, { one: 'category', many: 'categories' }, ids);
		if (err) return err;
		if (typeof c.description !== 'string' || c.description.length > MAX_DESCRIPTION_CHARS)
			return `"${c.name}": the description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`;
	}
	if (!ids.has(FALLBACK_CATEGORY_ID))
		return `The fallback category ("${FALLBACK_CATEGORY_ID}") cannot be deleted.`;
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
