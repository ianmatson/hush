import { describe, expect, it } from 'vitest';
import { classify, queryMatches } from './classify';
import { DEFAULT_SETTINGS } from './settings';
import {
	DEFAULT_SOURCES,
	MAX_SOURCES,
	sectionsFor,
	sourceKinds,
	trackedKeyOf,
	upgradeSources,
	searchIsUnscoped,
	newestFirst,
	validateSources,
	validateTracked
} from './sources';
import type { ThreadFacts } from './types';

describe('sourceKinds', () => {
	it('finds both kinds unless the search names one', () => {
		expect(sourceKinds('is:open author:@me')).toEqual(['pr', 'issue']);
		expect(sourceKinds('is:pr is:open')).toEqual(['pr']);
		expect(sourceKinds('is:issue label:bug')).toEqual(['issue']);
	});
	it('treats PR-only words as pull requests', () => {
		expect(sourceKinds('is:open review-requested:@me')).toEqual(['pr']);
		expect(sourceKinds('reviewed-by:@me')).toEqual(['pr']);
		expect(sourceKinds('is:open draft:false')).toEqual(['pr']);
	});
});

describe('sectionsFor', () => {
	it('adds the kind to searches that cover both, and skips the other kind', () => {
		const pr = sectionsFor('pr', DEFAULT_SOURCES);
		const issue = sectionsFor('issue', DEFAULT_SOURCES);
		expect(pr.find((s) => s.id === 'involves')?.query).toBe('is:pr is:open involves:@me');
		expect(issue.find((s) => s.id === 'involves')?.query).toBe('is:issue is:open involves:@me');
		expect(issue.some((s) => s.id === 'review-requests')).toBe(false);
		expect(issue.some((s) => s.id === 'reviewed')).toBe(false);
	});
	it('runs few searches by default', () => {
		expect(sectionsFor('pr', DEFAULT_SOURCES).filter((s) => s.enabled)).toHaveLength(3);
		expect(sectionsFor('issue', DEFAULT_SOURCES).filter((s) => s.enabled)).toHaveLength(1);
	});
});

describe('searchIsUnscoped', () => {
	it('is true for a search that looks at all of GitHub', () => {
		expect(searchIsUnscoped('is:open is:issue')).toBe(true);
		expect(searchIsUnscoped('is:open label:bug', 'archived:false')).toBe(true);
	});
	it('is false when a person, team, repository, or organization narrows it', () => {
		for (const s of DEFAULT_SOURCES) expect(searchIsUnscoped(s.query)).toBe(false);
		expect(searchIsUnscoped('is:open is:issue', 'org:acme')).toBe(false);
		expect(searchIsUnscoped('is:open repo:acme/web')).toBe(false);
	});
});

describe('newestFirst', () => {
	it('sorts by update time unless the search sorts', () => {
		expect(newestFirst('is:open')).toBe('is:open sort:updated-desc');
		expect(newestFirst('is:open sort:created-asc')).toBe('is:open sort:created-asc');
	});
});

describe('upgradeSources', () => {
	const old = [
		['review-me', 'is:pr is:open user-review-requested:@me'],
		['review-team', 'is:pr is:open team-review-requested:@team'],
		['mine', 'is:open author:@me'],
		['reviewed', 'is:pr is:open reviewed-by:@me -author:@me'],
		['assigned', 'is:open assignee:@me'],
		['mentioned', 'is:open mentions:@me'],
		['commented', 'is:issue is:open commenter:@me -author:@me'],
		['team-mentioned', 'is:open team:@team']
	].map(([id, query]) => ({ id, name: id, query, enabled: id !== 'team-mentioned' }));
	it('moves the old eight defaults to the new ones', () => {
		expect(upgradeSources(old)).toEqual(DEFAULT_SOURCES);
	});
	it('keeps a list you changed', () => {
		const changed = old.map((s) => (s.id === 'mine' ? { ...s, enabled: false } : s));
		expect(upgradeSources(changed)).toBe(changed);
		expect(upgradeSources(old.slice(1))).toHaveLength(7);
	});
});

describe('trackedKeyOf', () => {
	it('reads a PR or issue address, or owner/repo#123', () => {
		expect(trackedKeyOf('https://github.com/acme/web/pull/482')).toBe('acme/web#482');
		expect(trackedKeyOf(' https://github.com/acme/web/issues/7#issuecomment-1 ')).toBe(
			'acme/web#7'
		);
		expect(trackedKeyOf('acme/web#482')).toBe('acme/web#482');
		expect(trackedKeyOf('acme/web')).toBeNull();
	});
});

describe('validation', () => {
	it('accepts the defaults', () => {
		expect(validateSources(DEFAULT_SOURCES)).toBeNull();
		expect(validateTracked(['acme/web#1'])).toBeNull();
	});
	it('refuses bad sources', () => {
		const one = DEFAULT_SOURCES[0];
		expect(validateSources([one, one])).toMatch(/Two sources/);
		expect(validateSources([{ ...one, query: ' ' }])).toMatch(/search/);
		expect(validateSources([{ ...one, id: 'tracked' }])).toMatch(/tracked/);
		expect(
			validateSources(Array.from({ length: MAX_SOURCES + 1 }, (_, i) => ({ ...one, id: `s${i}` })))
		).toMatch(/Up to/);
	});
	it('refuses tracked items that are not owner/repo#n', () => {
		expect(validateTracked(['https://github.com/acme/web/pull/1'])).toMatch(/owner\/repo#123/);
	});
});

describe('source: in rules', () => {
	const t = (sources: string[]): ThreadFacts => ({
		repo: 'acme/web',
		subjectType: 'PullRequest',
		title: 'Fix',
		reason: 'subscribed',
		htmlUrl: 'https://github.com/acme/web/pull/1',
		me: 'ian',
		enrichment: { kind: 'pr' },
		sources
	});
	const matches = (q: string, facts: ThreadFacts) =>
		queryMatches(q, facts, classify(facts, DEFAULT_SETTINGS));
	it('matches the name of a source that found the item', () => {
		expect(matches('source:"Assigned to you"', t(['Assigned to you']))).toBe(true);
		expect(matches('source:"assigned*"', t(['Assigned to you']))).toBe(true);
		expect(matches('source:"Mentions you"', t(['Assigned to you']))).toBe(false);
		expect(matches('-source:"Mentions you"', t([]))).toBe(true);
	});
});
