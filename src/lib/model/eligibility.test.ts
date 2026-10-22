import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS, groupChoice } from '../shared/categories';
import type { CategoryGroup, Enrichment, ItemCategory, RuleFacts } from '../shared/types';
import { placeGroups, placedCategory, type Knowledge } from './eligibility';

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
		...over
	}) satisfies RuleFacts;

const group = (categories: ItemCategory[], id = 'area'): CategoryGroup => ({
	id,
	name: id,
	categories
});

const API: ItemCategory = {
	id: 'api',
	name: 'API',
	color: 'blue',
	rule: 'repo:acme/api OR label:api',
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

const knowing = (choices: Record<string, string> = {}, smartOn = true): Knowledge => ({
	smartOn,
	about: new Map(),
	choices: new Map(Object.entries(choices))
});

const jevChose = (g: CategoryGroup, id: string) => ({ [groupChoice(g)!.key]: id });

const placed = (t: RuleFacts, groups: CategoryGroup[], knowledge: Knowledge, pins: string[] = []) =>
	placeGroups(groups, t, pins, knowledge).map(placedCategory);

describe('placeGroups', () => {
	const area = group([API, BUGS, DOCS]);

	it('uses the first category whose rule matches', () => {
		const t = thread({ labels: ['docs'] }, { repo: 'acme/api' });
		expect(placed(t, [area], knowing(jevChose(area, 'bugs')))).toEqual(['api']);
	});
	it('can use any of the conditions of an OR rule', () => {
		expect(placed(thread({ labels: ['api'] }), [area], knowing())).toEqual(['api']);
	});
	it("uses Jev's choice when no rule matches", () => {
		expect(placed(thread(), [area], knowing(jevChose(area, 'bugs')))).toEqual(['bugs']);
	});
	it('leaves the item not sorted when no rule matches and smart decisions are off', () => {
		const [placement] = placeGroups([area], thread(), [], knowing({}, false));
		expect(placement.possible).toEqual([null]);
	});
	it('keeps every choice of Jev possible until Jev answers', () => {
		const [placement] = placeGroups([area], thread(), [], knowing());
		expect(placement.possible).toEqual(['bugs', 'docs', null]);
		expect(placedCategory(placement)).toBeNull();
	});
	it('ignores a Jev answer for other options or for a category that is gone', () => {
		const before = group([BUGS, { ...DOCS, description: 'Docs pages' }]);
		expect(placed(thread(), [area], knowing(jevChose(before, 'bugs')))).toEqual([null]);
		const [gone] = placeGroups([area], thread(), [], knowing(jevChose(area, 'gone')));
		expect(gone.possible).toEqual([null]);
	});
	it('keeps a category you chose, over rules and Jev', () => {
		const t = thread({}, { repo: 'acme/api' });
		expect(placed(t, [area], knowing(jevChose(area, 'bugs')), ['docs'])).toEqual(['docs']);
	});
	it('lets a stored rule that is not valid now match nothing', () => {
		const old = { ...API, rule: 'repo:acme/* type:ci' };
		expect(placed(thread(), [group([old])], knowing())).toEqual([null]);
		const removedWord = { ...API, rule: 'repo:acme/* in:fyi' };
		expect(placed(thread(), [group([removedWord])], knowing())).toEqual([null]);
	});
	it('ignores a pin to a deleted category', () => {
		expect(placed(thread(), [area], knowing({}, false), ['gone'])).toEqual([null]);
	});
	it('gives one category from each group', () => {
		const size = group([BIG], 'size');
		expect(placed(thread(), [area, size], knowing(jevChose(area, 'bugs')))).toEqual([
			'bugs',
			'big'
		]);
	});
	it('asks Jev nothing for a group with fewer than two descriptions', () => {
		expect(placed(thread(), [group([API, BUGS])], knowing())).toEqual([null]);
	});
	it('places the default effort and impact groups by the choices of Jev', () => {
		const [effort, impact] = DEFAULT_CATEGORY_GROUPS;
		const knowledge = knowing({
			...jevChose(effort, 'high-effort'),
			...jevChose(impact, 'low-impact')
		});
		expect(placed(thread(), DEFAULT_CATEGORY_GROUPS, knowledge)).toEqual([
			'high-effort',
			'low-impact'
		]);
	});
});
