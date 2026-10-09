import { describe, expect, it } from 'vitest';
import {
	categoryConditionText,
	categoryConditionTexts,
	DEFAULT_CATEGORY_GROUPS,
	groupChoice,
	itemQueryFacts,
	NO_PINS,
	pinsAfter,
	placeItem,
	validateCategoryGroups,
	type ItemPins
} from './categories';
import { classify, queryMatches } from './classify';
import { conditionId } from './decisions';
import { DEFAULT_SETTINGS } from './settings';
import type {
	CategoryGroup,
	Classification,
	DashItem,
	Enrichment,
	ItemCategory,
	ThreadFacts
} from './types';

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

const group = (categories: ItemCategory[], multiple = false, id = 'area'): CategoryGroup => ({
	id,
	name: id,
	multiple,
	categories
});

const place = (t: ThreadFacts, groups: CategoryGroup[], pins: ItemPins = NO_PINS) =>
	placeItem(t, classify(t, DEFAULT_SETTINGS), pins, groups);

const API: ItemCategory = {
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
const DOCS: ItemCategory = {
	id: 'docs',
	name: 'Docs',
	color: 'green',
	rule: 'label:docs',
	description: 'Documentation'
};

const jevChose = (g: CategoryGroup, id: string) => ({
	jevChoices: { [groupChoice(g)!.key]: id }
});

describe('placeItem: one category per item', () => {
	const area = group([API, BUGS, DOCS]);

	it('uses the first category whose rule matches', () => {
		const t = thread({ labels: ['docs'], ...jevChose(area, 'bugs') }, { repo: 'acme/api' });
		expect(place(t, [area]).categories).toEqual(['api']);
	});
	it('can use the source that found the item', () => {
		expect(place(thread({}, { sources: ['API bugs'] }), [area]).categories).toEqual(['api']);
	});
	it("uses Jev's choice when no rule matches", () => {
		expect(place(thread(jevChose(area, 'bugs')), [area]).categories).toEqual(['bugs']);
	});
	it('gives no category when no rule matches and Jev did not answer', () => {
		expect(place(thread(), [area]).categories).toEqual([]);
	});
	it('ignores a Jev answer for other options or for a category that is gone', () => {
		const before = group([BUGS]);
		expect(place(thread(jevChose(before, 'bugs')), [area]).categories).toEqual([]);
		expect(place(thread(jevChose(area, 'gone')), [area]).categories).toEqual([]);
	});
	it('keeps a category you chose, over rules and Jev', () => {
		const t = thread(jevChose(area, 'bugs'), { repo: 'acme/api' });
		expect(place(t, [area], { on: ['docs'], off: [] })).toEqual({
			categories: ['docs'],
			pinned: ['docs']
		});
	});
	it('skips a category you removed', () => {
		const t = thread(jevChose(area, 'bugs'), { repo: 'acme/api' });
		expect(place(t, [area], { on: [], off: ['api'] }).categories).toEqual(['bugs']);
		expect(place(thread(jevChose(area, 'bugs')), [area], { on: [], off: ['bugs'] })).toEqual({
			categories: [],
			pinned: ['bugs']
		});
	});
	it('lets a stored rule that is not valid now match nothing', () => {
		const old = { ...API, rule: 'repo:acme/* type:ci' };
		expect(place(thread(), [group([old])]).categories).toEqual([]);
		const notification = { ...API, rule: 'repo:acme/* in:fyi' };
		expect(place(thread(), [group([notification])]).categories).toEqual([]);
	});
	it('ignores a pin to a deleted category', () => {
		expect(place(thread(), [area], { on: ['gone'], off: [] })).toEqual({
			categories: [],
			pinned: []
		});
	});
});

describe('placeItem: any number per item', () => {
	const big: ItemCategory = {
		id: 'big',
		name: 'Big',
		color: 'red',
		rule: 'size:>200',
		description: ''
	};
	const blocked: ItemCategory = {
		id: 'blocked',
		name: 'Blocked',
		color: 'amber',
		rule: '',
		description: 'It waits on something'
	};
	const topics = group([big, blocked], true, 'topics');

	it('gives every category whose rule matches or whose description Jev says fits', () => {
		const t = thread({ smart: [conditionId(categoryConditionText(blocked))] });
		expect(place(t, [topics]).categories).toEqual(['big', 'blocked']);
		expect(place(thread(), [topics]).categories).toEqual(['big']);
	});
	it('adds and removes categories you set by hand', () => {
		expect(place(thread(), [topics], { on: ['blocked'], off: ['big'] }).categories).toEqual([
			'blocked'
		]);
	});
	it('places each group on its own', () => {
		const area = group([API, BUGS]);
		const t = thread(jevChose(area, 'bugs'));
		expect(place(t, [area, topics]).categories).toEqual(['bugs', 'big']);
	});
});

describe('Jev questions', () => {
	it('ask one choice for a one-per-item group, among the categories with a description', () => {
		expect(groupChoice(group([API, BUGS, DOCS]))?.options).toEqual({
			bugs: 'Bugs: Defects',
			docs: 'Docs: Documentation'
		});
		expect(groupChoice(group([API]))).toBeNull();
		expect(groupChoice(group([BUGS], true))).toBeNull();
	});
	it('ask again when the options change', () => {
		const before = groupChoice(group([BUGS]))!.key;
		expect(groupChoice(group([BUGS, DOCS]))!.key).not.toBe(before);
		expect(groupChoice(group([{ ...BUGS, rule: 'label:bug' }]))!.key).toBe(before);
	});
	it('ask yes or no for each described category in an any-number group', () => {
		expect(categoryConditionTexts([group([API, BUGS], true), group([DOCS])])).toEqual([
			'Bugs: Defects'
		]);
	});
});

describe('pinsAfter', () => {
	const area = group([API, BUGS]);
	const topics = group([DOCS], true, 'topics');
	const groups = [area, topics];

	it('replaces the other pins of a one-per-item group', () => {
		expect(
			pinsAfter({ on: ['api', 'docs'], off: [] }, { category: 'bugs', state: 'on' }, groups)
		).toEqual({ on: ['docs', 'bugs'], off: [] });
	});
	it('changes only that category in an any-number group', () => {
		expect(pinsAfter({ on: ['api'], off: [] }, { category: 'docs', state: 'off' }, groups)).toEqual(
			{ on: ['api'], off: ['docs'] }
		);
	});
	it('clears a group to let Hush choose again', () => {
		expect(
			pinsAfter({ on: ['api'], off: ['docs'] }, { group: 'area', state: 'auto' }, groups)
		).toEqual({ on: [], off: ['docs'] });
	});
	it('refuses an unknown category or group', () => {
		expect(pinsAfter(NO_PINS, { category: 'gone', state: 'on' }, groups)).toBeNull();
		expect(pinsAfter(NO_PINS, { group: 'gone', state: 'auto' }, groups)).toBeNull();
	});
});

describe('defaults', () => {
	it('are valid', () => {
		expect(validateCategoryGroups(DEFAULT_CATEGORY_GROUPS)).toBeNull();
	});
	it('are one effort group that Jev places', () => {
		expect(DEFAULT_CATEGORY_GROUPS).toHaveLength(1);
		const [effort] = DEFAULT_CATEGORY_GROUPS;
		expect(effort.multiple).toBe(false);
		expect(effort.categories.map((c) => c.name)).toEqual(['Low', 'Medium', 'High']);
		expect(Object.keys(groupChoice(effort)!.options)).toHaveLength(3);
		const t = thread(jevChose(effort, 'high-effort'));
		expect(place(t, DEFAULT_CATEGORY_GROUPS).categories).toEqual(['high-effort']);
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
		expect(validateCategoryGroups([group([BUGS]), group([BUGS], true, 'other')])).toMatch(
			/Two categories/
		);
		expect(validateCategoryGroups([group([BUGS]), group([DOCS])])).toMatch(/Two category groups/);
	});
	it('needs "multiple" to be true or false', () => {
		expect(validateCategoryGroups([{ ...group([]), multiple: 'yes' }])).toMatch(/"multiple"/);
	});
});

describe('category: in the Filter box', () => {
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
	const c = { category: 'fyi', kind: 'none' } as Classification;

	it('matches any category of the item by id or name', () => {
		expect(queryMatches('category:low-effort', facts, c)).toBe(true);
		expect(queryMatches('category:Low', facts, c)).toBe(true);
		expect(queryMatches('category:high-effort', facts, c)).toBe(false);
		expect(queryMatches('-category:High', facts, c)).toBe(true);
	});

	it('cannot be used in category rules', () => {
		expect(validateCategoryGroups([group([{ ...API, rule: 'category:bugs' }])])).toMatch(
			/cannot use category:/
		);
	});
	it.each(['needs:review', 'event:mentioned', 'in:fyi', 'repo:acme/* (author:bots OR -in:muted)'])(
		'rules cannot use notification words: %s',
		(rule) => {
			expect(validateCategoryGroups([group([{ ...API, rule }])])).toMatch(
				/cannot use event:, needs:, or in:/
			);
		}
	);
});
