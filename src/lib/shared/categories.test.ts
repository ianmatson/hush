import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CATEGORY_GROUPS,
	groupChoice,
	itemQueryFacts,
	matchesCategoryFilter,
	pinsAfter,
	placeItem,
	validateCategoryGroups
} from './categories';
import { queryMatches } from './rules';
import { DEFAULT_SETTINGS } from './settings';
import type { CategoryGroup, DashItem, Enrichment, ItemCategory, RuleFacts } from './types';

const thread = (enrichment: Partial<Enrichment> = {}, over: Partial<RuleFacts> = {}) =>
	({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix the login timeout',
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
		views: ['Mine'],
		...over
	}) satisfies RuleFacts;

const group = (categories: ItemCategory[], id = 'area'): CategoryGroup => ({
	id,
	name: id,
	categories
});

const place = (t: RuleFacts, groups: CategoryGroup[], pinned: string[] = []) =>
	placeItem(t, pinned, groups);

const API: ItemCategory = {
	id: 'api',
	name: 'API',
	color: 'blue',
	rule: 'repo:acme/api OR view:"API bugs"',
	description: ''
};
const BUGS: ItemCategory = {
	id: 'bugs',
	name: 'Bugs',
	color: 'orange',
	rule: '',
	description: 'Defects'
};
const DOCS: ItemCategory = {
	id: 'docs',
	name: 'Docs',
	color: 'green',
	rule: 'label:docs',
	description: 'Documentation'
};
const BIG: ItemCategory = {
	id: 'big',
	name: 'Big',
	color: 'red',
	rule: 'size:>200',
	description: ''
};

const jevChose = (g: CategoryGroup, id: string) => ({
	jevChoices: { [groupChoice(g)!.key]: id }
});

describe('placeItem', () => {
	const area = group([API, BUGS, DOCS]);

	it('uses the first category whose rule matches', () => {
		const t = thread({ labels: ['docs'], ...jevChose(area, 'bugs') }, { repo: 'acme/api' });
		expect(place(t, [area]).categories).toEqual(['api']);
	});
	it('can use the view that has the item', () => {
		expect(place(thread({}, { views: ['API bugs'] }), [area]).categories).toEqual(['api']);
	});
	it("uses Jev's choice when no rule matches", () => {
		expect(place(thread(jevChose(area, 'bugs')), [area]).categories).toEqual(['bugs']);
	});
	it('leaves the item not sorted when no rule matches and Jev did not answer', () => {
		expect(place(thread(), [area]).categories).toEqual([]);
	});
	it('ignores a Jev answer for other options or for a category that is gone', () => {
		const before = group([BUGS, { ...DOCS, description: 'Docs pages' }]);
		expect(place(thread(jevChose(before, 'bugs')), [area]).categories).toEqual([]);
		expect(place(thread(jevChose(area, 'gone')), [area]).categories).toEqual([]);
	});
	it('keeps a category you chose, over rules and Jev', () => {
		const t = thread(jevChose(area, 'bugs'), { repo: 'acme/api' });
		expect(place(t, [area], ['docs'])).toEqual({ categories: ['docs'], pinned: ['docs'] });
	});
	it('lets a stored rule that is not valid now match nothing', () => {
		const old = { ...API, rule: 'repo:acme/* type:ci' };
		expect(place(thread(), [group([old])]).categories).toEqual([]);
		const removedWord = { ...API, rule: 'repo:acme/* in:fyi' };
		expect(place(thread(), [group([removedWord])]).categories).toEqual([]);
	});
	it('ignores a pin to a deleted category', () => {
		expect(place(thread(), [area], ['gone'])).toEqual({ categories: [], pinned: [] });
	});
	it('gives one category from each group', () => {
		const size = group([BIG], 'size');
		const t = thread(jevChose(area, 'bugs'));
		expect(place(t, [area, size]).categories).toEqual(['bugs', 'big']);
	});
});

describe('Jev questions', () => {
	it('ask one choice for a group, among the categories with a description', () => {
		expect(groupChoice(group([API, BUGS, DOCS]))?.options).toEqual({
			bugs: 'Bugs: Defects',
			docs: 'Docs: Documentation'
		});
	});
	it('ask nothing for a group with fewer than two descriptions', () => {
		expect(groupChoice(group([API]))).toBeNull();
		expect(groupChoice(group([API, BUGS]))).toBeNull();
		expect(place(thread(), [group([API, BUGS])]).categories).toEqual([]);
	});
	it('ask again when the options change', () => {
		const before = groupChoice(group([BUGS, DOCS]))!.key;
		expect(groupChoice(group([BUGS, { ...DOCS, description: 'Guides' }]))!.key).not.toBe(before);
		expect(groupChoice(group([{ ...BUGS, rule: 'label:bug' }, DOCS]))!.key).toBe(before);
	});
});

describe('pinsAfter', () => {
	const area = group([API, BUGS]);
	const size = group([DOCS, BIG], 'size');
	const groups = [area, size];

	it('replaces the other pin of the same group', () => {
		expect(pinsAfter(['api', 'docs'], { group: 'area', category: 'bugs' }, groups)).toEqual([
			'docs',
			'bugs'
		]);
	});
	it('clears a group to let Hush choose again', () => {
		expect(pinsAfter(['api', 'docs'], { group: 'area', category: null }, groups)).toEqual(['docs']);
	});
	it('refuses an unknown group, or a category from another group', () => {
		expect(pinsAfter([], { group: 'gone', category: null }, groups)).toBeNull();
		expect(pinsAfter([], { group: 'area', category: 'docs' }, groups)).toBeNull();
	});
});

describe('matchesCategoryFilter', () => {
	const area = group([API, BUGS]);
	const size = group([BIG], 'size');
	const groups = [area, size];

	it('finds the items in a category', () => {
		expect(matchesCategoryFilter(['api', 'big'], { category: 'api' }, groups)).toBe(true);
		expect(matchesCategoryFilter(['bugs'], { category: 'api' }, groups)).toBe(false);
		expect(matchesCategoryFilter(undefined, { category: 'api' }, groups)).toBe(false);
	});
	it('finds the items that are not sorted in a group', () => {
		expect(matchesCategoryFilter(['big'], { notSortedIn: 'area' }, groups)).toBe(true);
		expect(matchesCategoryFilter(undefined, { notSortedIn: 'area' }, groups)).toBe(true);
		expect(matchesCategoryFilter(['api', 'big'], { notSortedIn: 'area' }, groups)).toBe(false);
		expect(matchesCategoryFilter([], { notSortedIn: 'gone' }, groups)).toBe(false);
	});
});

describe('defaults', () => {
	it('are valid', () => {
		expect(validateCategoryGroups(DEFAULT_CATEGORY_GROUPS)).toBeNull();
	});
	it('are an effort group and an impact group that Jev places', () => {
		expect(DEFAULT_CATEGORY_GROUPS.map((g) => g.id)).toEqual(['effort', 'impact']);
		for (const g of DEFAULT_CATEGORY_GROUPS) {
			expect(g.categories.map((c) => c.name)).toEqual(['Low', 'Medium', 'High']);
			expect(Object.keys(groupChoice(g)!.options)).toHaveLength(3);
		}
		const [effort, impact] = DEFAULT_CATEGORY_GROUPS;
		const t = thread({
			jevChoices: {
				...jevChose(effort, 'high-effort').jevChoices,
				...jevChose(impact, 'low-impact').jevChoices
			}
		});
		expect(place(t, DEFAULT_CATEGORY_GROUPS).categories).toEqual(['high-effort', 'low-impact']);
	});
});

describe('validation', () => {
	it('refuses a bad rule, colour, or duplicate id', () => {
		expect(validateCategoryGroups([group([{ ...BUGS, rule: '(label:x' }])])).toMatch(/“\(”/);
		expect(
			validateCategoryGroups([group([{ ...BUGS, color: 'black' as ItemCategory['color'] }])])
		).toMatch(/colour/);
		expect(validateCategoryGroups([group([BUGS, BUGS])])).toMatch(/Two categories/);
	});
	it('needs category ids that are unique across groups', () => {
		expect(validateCategoryGroups([group([BUGS]), group([BUGS], 'other')])).toMatch(
			/Two categories/
		);
		expect(validateCategoryGroups([group([BUGS]), group([DOCS])])).toMatch(/Two category groups/);
	});
});

describe('rules on the facts of an item', () => {
	const item = {
		id: 'acme/web#1',
		kind: 'pr',
		repo: 'acme/web',
		number: 1,
		title: 'Fix crash',
		url: 'https://github.com/acme/web/pull/1',
		author: 'alice',
		authorIsBot: false,
		labels: [],
		draft: false,
		state: 'open',
		assignees: [],
		requestedMe: false,
		requestedTeams: [],
		additions: 3,
		deletions: 1,
		lastCommentBy: null,
		lastCommentIsBot: false,
		lastCommentAt: null,
		updatedAt: '2026-10-01T00:00:00Z',
		sections: [],
		categories: ['low-effort']
	} as unknown as DashItem;
	const facts = itemQueryFacts(item, 'ian', DEFAULT_SETTINGS);
	it('match the PR or issue', () => {
		expect(queryMatches('repo:acme/* author:alice', facts)).toBe(true);
		expect(queryMatches('author:bots', facts)).toBe(false);
	});

	it.each(['category:bugs', 'needs:review', 'event:mentioned', 'in:fyi'])(
		'rules cannot use removed words: %s',
		(rule) => {
			expect(validateCategoryGroups([group([{ ...API, rule }])])).toMatch(
				/Unknown “(category|needs|event|in):”/
			);
		}
	);
});
