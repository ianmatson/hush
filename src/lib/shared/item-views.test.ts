import { describe, expect, it } from 'vitest';
import { classify, queryMatches } from './classify';
import { DEFAULT_SETTINGS } from './settings';
import {
	DEFAULT_VIEWS,
	MAX_VIEW_SEARCHES,
	MAX_VIEWS,
	newestFirst,
	searchIsUnscoped,
	searchKinds,
	sectionsFor,
	validateViews,
	viewKinds
} from './item-views';
import type { ItemView, ThreadFacts } from './types';

const view = (over: Partial<ItemView> = {}): ItemView => ({
	id: 'web',
	name: 'Web',
	searches: ['repo:acme/web is:open'],
	...over
});

describe('searchKinds', () => {
	it('finds both kinds unless the search names one', () => {
		expect(searchKinds('is:open author:@me')).toEqual(['pr', 'issue']);
		expect(searchKinds('is:pr is:open')).toEqual(['pr']);
		expect(searchKinds('is:issue label:bug')).toEqual(['issue']);
	});
	it('treats PR-only words as pull requests', () => {
		expect(searchKinds('is:open review-requested:@me')).toEqual(['pr']);
		expect(searchKinds('reviewed-by:@me')).toEqual(['pr']);
		expect(searchKinds('is:open draft:false')).toEqual(['pr']);
	});
});

describe('viewKinds', () => {
	it('has the kinds that its searches can find', () => {
		expect(viewKinds(view({ searches: ['is:pr is:open'] }))).toEqual(['pr']);
		expect(viewKinds(view({ searches: ['is:issue', 'is:pr'] }))).toEqual(['pr', 'issue']);
		expect(viewKinds(DEFAULT_VIEWS[0])).toEqual(['pr', 'issue']);
	});
});

describe('sectionsFor', () => {
	it('gives one section per search, with the view id, for the searches that find the kind', () => {
		const views = [
			view(),
			view({ id: 'reviews', name: 'Reviews', searches: ['review-requested:@me'] })
		];
		expect(sectionsFor('pr', views)).toEqual([
			{ id: 'web', name: 'Web', query: 'is:pr repo:acme/web is:open' },
			{ id: 'reviews', name: 'Reviews', query: 'is:pr review-requested:@me' }
		]);
		expect(sectionsFor('issue', views)).toEqual([
			{ id: 'web', name: 'Web', query: 'is:issue repo:acme/web is:open' }
		]);
	});
	it('keeps a kind that the search names', () => {
		expect(sectionsFor('pr', [view({ searches: ['type:pr label:bug'] })])[0].query).toBe(
			'type:pr label:bug'
		);
	});
});

describe('searchIsUnscoped', () => {
	it('is true for a search that looks at all of GitHub', () => {
		expect(searchIsUnscoped('is:open is:issue')).toBe(true);
		expect(searchIsUnscoped('is:open label:bug archived:false')).toBe(true);
	});
	it('is false when a person, team, repository, or organization narrows it', () => {
		for (const q of DEFAULT_VIEWS[0].searches) expect(searchIsUnscoped(q)).toBe(false);
		expect(searchIsUnscoped('is:open is:issue org:acme')).toBe(false);
		expect(searchIsUnscoped('is:open repo:acme/web')).toBe(false);
	});
});

describe('newestFirst', () => {
	it('sorts by update time unless the search sorts', () => {
		expect(newestFirst('is:open')).toBe('is:open sort:updated-desc');
		expect(newestFirst('is:open sort:created-asc')).toBe('is:open sort:created-asc');
	});
});

describe('validateViews', () => {
	it('accepts the defaults', () => {
		expect(validateViews(DEFAULT_VIEWS)).toBeNull();
	});
	it('refuses bad views', () => {
		expect(validateViews([])).toMatch(/at least one/);
		expect(validateViews([view(), view()])).toMatch(/Two views/);
		expect(validateViews([view({ name: ' ' })])).toMatch(/name/);
		expect(validateViews([view({ searches: [' '] })])).toMatch(/search/);
		expect(validateViews([view({ searches: [] })])).toMatch(/add a search/);
		expect(
			validateViews([view({ searches: Array(MAX_VIEW_SEARCHES + 1).fill('is:open') })])
		).toMatch(/Up to|up to/);
		expect(
			validateViews(Array.from({ length: MAX_VIEWS + 1 }, (_, i) => view({ id: `v${i}` })))
		).toMatch(/Up to/);
	});
});

describe('view: in rules', () => {
	const t = (views: string[]): ThreadFacts => ({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix',
		reason: 'subscribed',
		htmlUrl: 'https://github.com/acme/web/pull/1',
		me: 'ian',
		enrichment: { kind: 'pr' },
		views
	});
	const matches = (q: string, facts: ThreadFacts) =>
		queryMatches(q, facts, classify(facts, DEFAULT_SETTINGS));
	it('matches the name of a view that has the item', () => {
		expect(matches('view:Mine', t(['Mine']))).toBe(true);
		expect(matches('view:"web*"', t(['Website']))).toBe(true);
		expect(matches('view:Website', t(['Mine']))).toBe(false);
		expect(matches('-view:Website', t([]))).toBe(true);
	});
});
