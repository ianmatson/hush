import { describe, expect, it } from 'vitest';
import { queryMatches } from './rules';
import { dateMatches, queryError, resolveToday, splitSearch, suggest } from './query';
import { sectionsFor, validateViews, viewsPassingFilters } from './item-views';
import { parseSettings } from './settings';
import type { Enrichment, ItemView, RuleFacts } from './types';

const NOW = Date.parse('2026-10-10T15:00:00Z');

function item(enrichment: Partial<Enrichment> = {}, over: Partial<RuleFacts> = {}): RuleFacts {
	return {
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix the login timeout',
		me: 'ian',
		now: NOW,
		enrichment: {
			kind: 'pr',
			author: 'alice',
			labels: ['bug'],
			assignees: [],
			reviewRequests: [],
			additions: 20,
			deletions: 10,
			comments: 3,
			createdAt: '2026-09-01T10:00:00Z',
			updatedAt: '2026-10-08T10:00:00Z',
			...enrichment
		},
		...over
	};
}

describe('splitSearch', () => {
	it('sends GitHub words to GitHub and keeps Hush words for Hush', () => {
		expect(splitSearch('is:pr review-requested:@me size:<50 category:low')).toEqual({
			github: 'is:pr review-requested:@me',
			hush: 'size:<50 category:low',
			errors: []
		});
	});
	it('keeps words that GitHub cannot read for Hush: bots and wildcards', () => {
		expect(splitSearch('-author:bots repo:acme/* label:bug').hush).toBe('-author:bots repo:acme/*');
		expect(splitSearch('-author:bots repo:acme/* label:bug').github).toBe('label:bug');
	});
	it('sends unknown words and free text to GitHub as written', () => {
		expect(splitSearch('in:title login is:locked "exact phrase"')).toEqual({
			github: 'in:title login is:locked "exact phrase"',
			hush: '',
			errors: []
		});
	});
	it('reads a project board search as written', () => {
		expect(splitSearch('project:acme/5 status:"In progress"')).toEqual({
			github: 'project:acme/5 status:"In progress"',
			hush: '',
			errors: []
		});
	});
	it('refuses OR, parentheses, about:, and more than one value for GitHub', () => {
		expect(splitSearch('is:pr OR is:issue').errors[0]).toMatch(/cannot use OR/);
		expect(splitSearch('(is:pr)').errors[0]).toMatch(/cannot use OR/);
		expect(splitSearch('about:"migrations"').errors[0]).toMatch(/cannot use about:/);
		expect(splitSearch('author:alice,bob').errors[0]).toMatch(/give author: one value/);
		expect(splitSearch('label:bug,docs').errors).toEqual([]);
	});
	it('checks the Hush words', () => {
		expect(splitSearch('size:big').errors[0]).toMatch(/size:big/);
	});
});

describe('dates', () => {
	it('turns @today into a date for GitHub', () => {
		expect(resolveToday('updated:<@today-7d created:>@today-2w closed:@today', NOW)).toBe(
			'updated:<2026-10-03 created:>2026-09-26 closed:2026-10-10'
		);
	});
	it('compares by whole days, like GitHub', () => {
		const at = '2026-10-03T12:00:00Z';
		expect(dateMatches('2026-10-03', at, NOW)).toBe(true);
		expect(dateMatches('<2026-10-03', at, NOW)).toBe(false);
		expect(dateMatches('<=2026-10-03', at, NOW)).toBe(true);
		expect(dateMatches('>2026-10-02', at, NOW)).toBe(true);
		expect(dateMatches('>2026-10-03', at, NOW)).toBe(false);
		expect(dateMatches('>=2026-10-03', at, NOW)).toBe(true);
		expect(dateMatches('2026-10-01..2026-10-03', at, NOW)).toBe(true);
		expect(dateMatches('2026-10-04..*', at, NOW)).toBe(false);
		expect(dateMatches('<@today-6d', at, NOW)).toBe(true);
		expect(dateMatches('>=@today-1w', at, NOW)).toBe(true);
		expect(dateMatches('<2026-10-03', null, NOW)).toBe(false);
	});
});

describe('the words that GitHub and Hush share', () => {
	it('match the facts of the item', () => {
		const t = item({ reviewDecision: 'APPROVED', reviewed: true, ci: 'FAILURE' });
		expect(queryMatches('org:acme review:approved status:failure', t)).toBe(true);
		expect(queryMatches('review:none', t)).toBe(false);
		expect(queryMatches('review:none', item())).toBe(true);
		expect(queryMatches('status:pending', item({ ci: 'EXPECTED' }))).toBe(true);
		expect(queryMatches('comments:>2 comments:<5', t)).toBe(true);
		expect(queryMatches('created:<@today-30d updated:>@today-7d', t)).toBe(true);
		expect(queryMatches('no:assignee -no:label', t)).toBe(true);
		expect(queryMatches('is:pr', t)).toBe(true);
		expect(queryMatches('is:issue', t)).toBe(false);
		expect(queryMatches('draft:true', item({ draft: true }))).toBe(true);
		expect(queryMatches('draft:false', item({ draft: true }))).toBe(false);
	});
	it('match categories by name or id', () => {
		const t = item({}, { categories: [{ id: 'low', name: 'Low effort' }] });
		expect(queryMatches('category:low', t)).toBe(true);
		expect(queryMatches('category:"Low effort"', t)).toBe(true);
		expect(queryMatches('-category:high', t)).toBe(true);
	});
});

describe('queryError by place', () => {
	it('lets each place use only the words that work there', () => {
		expect(queryError('category:low', 'rule')).toMatch(/cannot use category:/);
		expect(queryError('category:low', 'section')).toBeNull();
		expect(queryError('about:"x"', 'section')).toMatch(/Sections cannot use about:/);
		expect(queryError('mentions:@me', 'rule')).toMatch(/works only in a view's search/);
		expect(queryError('mentions:@me size:<50', 'search')).toBeNull();
		expect(queryError('is:pr OR is:issue', 'search')).toMatch(/cannot use OR/);
	});
	it('suggests only the words that work in the place', () => {
		const keys = (place: 'rule' | 'search') => suggest('m', 1, place).items.map((i) => i.label);
		expect(keys('search')).toContain('mentions:');
		expect(keys('rule')).not.toContain('mentions:');
	});
});

describe('views with Hush words', () => {
	const view: ItemView = {
		id: 'quick',
		name: 'Quick',
		searches: ['is:open review-requested:@me size:<50 updated:>@today-7d'],
		groupBy: 'none'
	};
	it('send GitHub the GitHub words, with dates, and keep the Hush words as a filter', () => {
		expect(sectionsFor('pr', [view], NOW)).toEqual([
			{
				id: 'quick',
				name: 'Quick',
				query: 'is:pr is:open review-requested:@me updated:>2026-10-03',
				filter: 'size:<50'
			}
		]);
	});
	it('keep a view only when one of its searches finds the item and its filter passes', () => {
		const filters = new Map([
			['quick', new Set(['size:<20'])],
			['mine', new Set([''])],
			['both', new Set(['size:<20', 'label:bug'])]
		]);
		expect([...viewsPassingFilters(['quick', 'mine', 'both'], filters, item())]).toEqual([
			'mine',
			'both'
		]);
	});
	it('find only pull requests when a search uses size:', () => {
		expect(sectionsFor('issue', [view], NOW)).toEqual([]);
	});
	it('keep saved views whose search has an error, so the settings page can show it', () => {
		const saved = JSON.stringify({ views: [{ ...view, searches: ['is:pr OR is:issue'] }] });
		expect(parseSettings(saved).views[0].id).toBe('quick');
	});
	it('refuse a search that Hush cannot run', () => {
		expect(validateViews([{ ...view, searches: ['is:pr OR is:issue'] }])).toMatch(
			/"Quick": A view's search cannot use OR/
		);
	});
});
