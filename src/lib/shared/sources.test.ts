import { describe, expect, it } from 'vitest';
import { classifyDefault, queryMatches } from './classify';
import { DEFAULT_SETTINGS } from './settings';
import {
	DEFAULT_SOURCES,
	MAX_SOURCES,
	sectionsFor,
	sourceKinds,
	trackedKeyOf,
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
		expect(pr.find((s) => s.id === 'mine')?.query).toBe('is:pr is:open author:@me');
		expect(issue.find((s) => s.id === 'mine')?.query).toBe('is:issue is:open author:@me');
		expect(issue.some((s) => s.id === 'review-me')).toBe(false);
		expect(pr.some((s) => s.id === 'commented')).toBe(false);
	});
	it('keeps the searches of the old dashboards', () => {
		expect(sectionsFor('pr', DEFAULT_SOURCES).filter((s) => s.enabled)).toHaveLength(6);
		expect(sectionsFor('issue', DEFAULT_SOURCES).filter((s) => s.enabled)).toHaveLength(4);
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
		queryMatches(q, facts, classifyDefault(facts, DEFAULT_SETTINGS));
	it('matches the name of a source that found the item', () => {
		expect(matches('source:"Assigned to you"', t(['Assigned to you']))).toBe(true);
		expect(matches('source:"assigned*"', t(['Assigned to you']))).toBe(true);
		expect(matches('source:"Mentions you"', t(['Assigned to you']))).toBe(false);
		expect(matches('-source:"Mentions you"', t([]))).toBe(true);
	});
});
