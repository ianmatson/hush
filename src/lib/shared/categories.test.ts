import { describe, expect, it } from 'vitest';
import {
	categoryChoiceOptions,
	DEFAULT_CATEGORIES,
	DEFAULT_TAGS,
	FALLBACK_CATEGORY_ID,
	itemQueryFacts,
	markAboutTexts,
	placeItem,
	validateCategories,
	validateTags
} from './categories';
import { classifyDefault, queryMatches } from './classify';
import { DEFAULT_SOURCES } from './sources';
import { conditionId } from './decisions';
import { DEFAULT_SETTINGS } from './settings';
import type { DashItem, Enrichment, ItemCategory, ItemTag, ThreadFacts } from './types';

const thread = (enrichment: Partial<Enrichment> = {}, over: Partial<ThreadFacts> = {}) =>
	({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix the login timeout',
		reason: '',
		htmlUrl: 'https://github.com/acme/web/pull/1',
		me: 'ian',
		enrichment: {
			kind: 'pr',
			author: 'alice',
			labels: [],
			additions: 300,
			deletions: 20,
			smart: [],
			...enrichment
		},
		sources: ['You opened'],
		...over
	}) satisfies ThreadFacts;

const settings = (categories: ItemCategory[], tags: ItemTag[] = []) => ({ categories, tags });
const place = (
	t: ThreadFacts,
	s: ReturnType<typeof settings>,
	jev: string | null = null,
	pins = {}
) => placeItem(t, classifyDefault(t, DEFAULT_SETTINGS), jev, pins, s);

const API_BUGS: ItemCategory = {
	id: 'api',
	name: 'API',
	color: 'blue',
	rule: 'repo:acme/api OR source:"API bugs"',
	description: ''
};
const BUGS: ItemCategory = {
	id: 'bugs',
	name: 'Bugs',
	color: 'orange',
	rule: '',
	description: 'Defects'
};
const OTHER: ItemCategory = {
	id: FALLBACK_CATEGORY_ID,
	name: 'Other',
	color: 'gray',
	rule: '',
	description: ''
};

describe('placeItem: category', () => {
	const s = settings([API_BUGS, BUGS, OTHER]);
	it('puts an item in exactly one category: a matching rule first', () => {
		expect(place(thread({}, { repo: 'acme/api' }), s, 'bugs')).toMatchObject({
			category: 'api',
			categoryBy: 'rule'
		});
	});
	it('can use the source that found the item', () => {
		expect(place(thread({}, { sources: ['API bugs'] }), s).category).toBe('api');
	});
	it("uses Jev's choice when no rule matches", () => {
		expect(place(thread(), s, 'bugs')).toMatchObject({ category: 'bugs', categoryBy: 'jev' });
	});
	it('ignores a Jev choice of a category without a description, or that no longer exists', () => {
		expect(place(thread(), s, 'api').category).toBe(FALLBACK_CATEGORY_ID);
		expect(place(thread(), s, 'gone').category).toBe(FALLBACK_CATEGORY_ID);
	});
	it('falls back to Other', () => {
		expect(place(thread(), s)).toMatchObject({
			category: FALLBACK_CATEGORY_ID,
			categoryBy: 'fallback'
		});
	});
	it('keeps a category you chose, over rules and Jev', () => {
		expect(place(thread({}, { repo: 'acme/api' }), s, 'bugs', { category: 'bugs' })).toMatchObject({
			category: 'bugs',
			categoryBy: 'pin'
		});
	});
	it('ignores a pin to a deleted category', () => {
		expect(place(thread(), s, null, { category: 'gone' }).category).toBe(FALLBACK_CATEGORY_ID);
	});
});

describe('placeItem: tags', () => {
	const big: ItemTag = { id: 'big', name: 'Big', color: 'red', rule: 'size:>200' };
	const blocked: ItemTag = {
		id: 'blocked',
		name: 'Blocked',
		color: 'amber',
		rule: 'about:"waits on something"'
	};
	const s = settings([OTHER], [big, blocked]);
	it('gives every tag whose rule matches, also with Jev', () => {
		const t = thread({ smart: [conditionId('waits on something')] });
		expect(place(t, s).tags).toEqual(['big', 'blocked']);
		expect(place(thread(), s).tags).toEqual(['big']);
	});
	it('adds and removes tags you set by hand', () => {
		expect(place(thread(), s, null, { tagsOn: ['blocked'], tagsOff: ['big'] }).tags).toEqual([
			'blocked'
		]);
	});
});

describe('categoryChoiceOptions', () => {
	it('lists the categories with a description, then "none of these"', () => {
		expect(categoryChoiceOptions([API_BUGS, BUGS, OTHER])).toEqual([
			{ id: 'bugs', label: 'Bugs: Defects' },
			{ id: FALLBACK_CATEGORY_ID, label: 'None of these' }
		]);
		expect(categoryChoiceOptions([API_BUGS, OTHER])).toEqual([]);
	});
});

describe('presets', () => {
	it('are valid', () => {
		expect(validateCategories(DEFAULT_CATEGORIES)).toBeNull();
		expect(validateTags(DEFAULT_TAGS)).toBeNull();
	});
	it('collect the about: conditions of categories and tags', () => {
		expect(markAboutTexts({ categories: DEFAULT_CATEGORIES, tags: DEFAULT_TAGS })).toHaveLength(4);
	});
});

describe('validation', () => {
	it('keeps the fallback category', () => {
		expect(validateCategories([BUGS])).toMatch(/cannot be deleted/);
	});
	it('refuses a bad rule, colour, or duplicate id', () => {
		expect(validateCategories([{ ...BUGS, rule: '(label:x' }, OTHER])).toMatch(/“\(”/);
		expect(validateTags([{ id: 'a', name: 'A', color: 'black', rule: '' }])).toMatch(/colour/);
		expect(validateCategories([BUGS, BUGS, OTHER])).toMatch(/Two categories/);
	});
});

describe('category: and tag: in the Filter box', () => {
	const item = {
		id: 'acme/web#1',
		kind: 'pr',
		number: 1,
		title: 'Fix the login timeout',
		url: 'https://github.com/acme/web/pull/1',
		repo: 'acme/web',
		author: 'alice',
		authorIsBot: false,
		labels: [],
		assignees: [],
		requestedMe: false,
		requestedTeams: [],
		additions: 10,
		deletions: 2,
		draft: false,
		state: 'open',
		lastCommentBy: null,
		lastCommentIsBot: false,
		lastCommentAt: null,
		updatedAt: '2026-10-01T00:00:00Z',
		sections: ['mine'],
		category: 'bugs',
		tags: ['quick']
	} as unknown as DashItem;
	const facts = itemQueryFacts(item, 'ian', {
		categories: DEFAULT_CATEGORIES,
		tags: DEFAULT_TAGS,
		sources: DEFAULT_SOURCES
	});
	const matches = (q: string) => queryMatches(q, facts, classifyDefault(facts, DEFAULT_SETTINGS));
	it('matches a category or tag by id or name', () => {
		expect(matches('category:bugs')).toBe(true);
		expect(matches('category:Bugs')).toBe(true);
		expect(matches('category:features')).toBe(false);
		expect(matches('tag:quick')).toBe(true);
		expect(matches('tag:"Breaking change"')).toBe(false);
		expect(matches('-tag:blocked source:"You opened" size:<50')).toBe(true);
	});
	it('cannot be used inside category and tag rules', () => {
		expect(validateTags([{ id: 'a', name: 'A', color: 'blue', rule: 'category:bugs' }])).toMatch(
			/cannot use category: or tag:/
		);
	});
});
