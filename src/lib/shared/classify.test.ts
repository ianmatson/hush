import { describe, expect, it } from 'vitest';
import { classify, globToRegExp, categoryTriage, shouldPush, withOverride } from './classify';
import { DEFAULT_CATEGORIES } from './categories';
import { DEFAULT_SETTINGS } from './settings';
import type { Classification, Enrichment, ItemCategory, Settings, ThreadFacts } from './types';

const pr = (e: Partial<Enrichment> = {}): Enrichment => ({
	kind: 'pr',
	number: 7,
	url: 'https://github.com/o/r/pull/7',
	state: 'open',
	author: 'alice',
	...e
});

const facts = (over: Partial<ThreadFacts> = {}): ThreadFacts => ({
	repo: 'acme/web',
	subjectType: 'PullRequest',
	title: 'Add thing',
	reason: 'subscribed',
	htmlUrl: 'https://github.com/o/r/pull/7',
	enrichment: pr(),
	me: 'ian',
	...over
});

const run = (f: ThreadFacts, s: Partial<Settings> = {}) =>
	classify(f, { ...DEFAULT_SETTINGS, ...s });

const category = (name: string, rule: string, inbox: Partial<ItemCategory> = {}): ItemCategory => ({
	id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
	name,
	color: 'gray',
	rule,
	description: '',
	...inbox
});
const withCategories = (...first: ItemCategory[]): Partial<Settings> => ({
	categories: [...first, ...DEFAULT_CATEGORIES]
});

describe('default classification', () => {
	it('flags a direct review request as action, linking to the diff', () => {
		const c = run(
			facts({ reason: 'review_requested', enrichment: pr({ reviewRequestedFromMe: true }) })
		);
		expect(c).toMatchObject({
			category: 'action',
			kind: 'review',
			actionUrl: 'https://github.com/o/r/pull/7/files'
		});
	});

	it('treats a team-only review request as FYI', () => {
		const c = run(
			facts({ reason: 'review_requested', enrichment: pr({ requestedTeams: ['web'] }) })
		);
		expect(c.category).toBe('fyi');
	});

	it('flags CI failure on my PR before anything else', () => {
		const c = run(
			facts({
				reason: 'author',
				enrichment: pr({ author: 'ian', ci: 'FAILURE', reviewDecision: 'APPROVED' })
			})
		);
		expect(c).toMatchObject({ category: 'action', kind: 'fix_ci' });
	});

	it('says my approved, green PR is ready to merge', () => {
		const c = run(
			facts({
				reason: 'author',
				enrichment: pr({ author: 'ian', ci: 'SUCCESS', reviewDecision: 'APPROVED' })
			})
		);
		expect(c.kind).toBe('merge');
	});

	it('does not say "ready to merge" while CI is pending', () => {
		const c = run(
			facts({
				reason: 'author',
				enrichment: pr({ author: 'ian', ci: 'PENDING', reviewDecision: 'APPROVED' })
			})
		);
		expect(c.kind).not.toBe('merge');
	});

	it('ignores my own last comment', () => {
		const lastComment = {
			author: 'ian',
			authorIsBot: false,
			body: 'done',
			url: 'u',
			createdAt: ''
		};
		const c = run(facts({ reason: 'comment', enrichment: pr({ lastComment }) }));
		expect(c.category).toBe('fyi');
	});

	it('treats a bot comment on my PR as FYI when botsAreFyi is on', () => {
		const lastComment = {
			author: 'codecov[bot]',
			authorIsBot: true,
			body: 'coverage',
			url: 'u',
			createdAt: '2026-09-20T00:00:00Z'
		};
		const f = facts({ reason: 'author', enrichment: pr({ author: 'ian', lastComment }) });
		expect(run(f).category).toBe('fyi');
		expect(run(f, { botsAreFyi: false }).kind).toBe('reply');
	});

	it('treats a bot mention as FYI, a human mention as action', () => {
		const bot = {
			author: 'github-actions',
			authorIsBot: true,
			body: '@ian preview ready',
			url: 'u',
			createdAt: ''
		};
		expect(run(facts({ reason: 'mention', enrichment: pr({ lastComment: bot }) })).category).toBe(
			'fyi'
		);
		const human = { ...bot, author: 'bob', authorIsBot: false };
		expect(run(facts({ reason: 'mention', enrichment: pr({ lastComment: human }) })).kind).toBe(
			'reply'
		);
		expect(run(facts({ reason: 'mention', enrichment: pr({ lastComment: null }) })).kind).toBe(
			'reply'
		);
	});

	it('flags a PR assigned to me', () => {
		expect(run(facts({ reason: 'assign', enrichment: pr({ assignedToMe: true }) })).kind).toBe(
			'triage'
		);
	});

	it('treats merged PRs as FYI', () => {
		expect(run(facts({ reason: 'mention', enrichment: pr({ state: 'merged' }) })).category).toBe(
			'fyi'
		);
	});

	it('flags failed workflow runs', () => {
		const c = run(
			facts({
				subjectType: 'CheckSuite',
				title: 'CI workflow run failed for main branch',
				enrichment: null,
				reason: 'ci_activity'
			})
		);
		expect(c.kind).toBe('fix_ci');
	});
});

describe('categories in the inbox', () => {
	it('the first matching category wins and can change push', () => {
		const c = run(
			facts({ reason: 'review_requested', enrichment: pr({ reviewRequestedFromMe: true }) }),
			withCategories(
				category('Docs', 'repo:acme/website', { inbox: 'muted' }),
				category('Quiet acme', 'repo:acme/* needs:review', { push: 'off' }),
				category('Never reached', 'repo:acme/*', { inbox: 'muted' })
			)
		);
		expect(c).toMatchObject({ category: 'action', rule: 'Quiet acme', push: false });
		expect(shouldPush(c, DEFAULT_SETTINGS)).toBe(false);
	});

	it('leaves Hush’s decision alone for a category with no inbox settings', () => {
		const c = run(facts(), withCategories(category('Web', 'repo:acme/web')));
		expect(c.category).toBe('fyi');
		expect(c.rule).toBeUndefined();
	});

	it('places threads that are not PRs or issues by their thread facts, else in Other', () => {
		const release = facts({ subjectType: 'Release', enrichment: null });
		const releases = category('Releases', 'type:release', { inbox: 'action', push: 'on' });
		expect(run(release, withCategories(releases))).toMatchObject({
			category: 'action',
			push: true,
			rule: 'Releases'
		});
		const other = DEFAULT_CATEGORIES.map((c) =>
			c.id === 'other' ? { ...c, inbox: 'muted' as const } : c
		);
		expect(run(release, { categories: other }).category).toBe('muted');
	});

	it('follows a pinned category, then Jev, before the fallback', () => {
		const loud = category('Loud', '', { inbox: 'action', description: 'Loud things' });
		const s = withCategories(loud);
		expect(run(facts({ pinnedCategory: 'loud' }), s).category).toBe('action');
		expect(run(facts({ enrichment: pr({ jevCategory: 'loud' }) }), s).category).toBe('action');
		expect(run(facts(), s).category).toBe('fyi');
	});

	it('matches on state', () => {
		const s = withCategories(category('Merged', 'is:merged', { triage: 'done' }));
		expect(run(facts({ enrichment: pr({ state: 'merged' }) }), s).rule).toBe('Merged');
		expect(run(facts(), s).rule).toBeUndefined();
		expect(run(facts({ enrichment: null }), s).rule).toBeUndefined();
	});

	it('categoryTriage moves only for categories that ask', () => {
		const now = 1_000_000;
		const done = run(facts(), withCategories(category('X', 'repo:acme/*', { triage: 'done' })));
		expect(categoryTriage(done, now)).toEqual({ triage: 'done', note: 'Category: X' });
		const snooze = run(
			facts(),
			withCategories(category('Later', 'repo:acme/*', { triage: 'snooze', snoozeHours: 4 }))
		);
		expect(categoryTriage(snooze, now)).toEqual({
			triage: 'snoozed',
			until: now + 4 * 3_600_000,
			note: 'Category: Later'
		});
		const day = run(facts(), withCategories(category('Day', 'repo:acme/*', { triage: 'snooze' })));
		expect(categoryTriage(day, now)).toMatchObject({ until: now + 24 * 3_600_000 });
		expect(
			categoryTriage(
				run(facts(), withCategories(category('Push', 'repo:acme/*', { push: 'on' }))),
				now
			)
		).toBeNull();
		expect(categoryTriage(run(facts()), now)).toBeNull();
	});

	it('globs match owner/repo case-insensitively', () => {
		expect(globToRegExp('ACME/*').test('acme/web')).toBe(true);
		expect(globToRegExp('acme/web').test('acme/website')).toBe(false);
	});
});

describe('team review requests', () => {
	const f = facts({
		repo: 'acme/web',
		reason: 'review_requested',
		enrichment: pr({ requestedTeams: ['web'] }),
		myTeams: ['acme/web']
	});
	it('are FYI by default and "Needs you" when the setting is on', () => {
		expect(run(f).category).toBe('fyi');
		expect(run(f, { teamReviewsAreAction: true })).toMatchObject({
			category: 'action',
			kind: 'review'
		});
	});
});

describe('latest activity', () => {
	const bot = {
		author: 'github-actions',
		authorIsBot: true,
		body: '',
		url: 'u',
		createdAt: '2026-09-28T10:00:00Z'
	};
	const mine = (e: Partial<Enrichment> = {}) =>
		facts({ reason: 'author', enrichment: pr({ author: 'ian', ...e }) });

	it('says what happened on your PR', () => {
		expect(run(mine({ lastComment: bot })).summary).toBe('@github-actions commented on your PR');
		expect(run(mine({ lastCommitAt: '2026-09-28T11:00:00Z', lastComment: bot })).summary).toBe(
			'New commits on your PR'
		);
		expect(run(mine()).summary).toBe('Activity on your PR');
	});

	it('matches who did it', () => {
		const ci = withCategories(category('ci bots', 'from:github-*', { triage: 'done' }));
		expect(run(mine({ lastComment: bot }), ci).rule).toBe('ci bots');
		const people = withCategories(category('people', '-from:bots', { inbox: 'action' }));
		expect(run(mine({ lastComment: bot }), people).rule).toBeUndefined();
		expect(
			run(mine({ lastComment: { ...bot, author: 'alice', authorIsBot: false } }), people).rule
		).toBe('people');
	});
});

describe('"Doesn\'t need me: only this one"', () => {
	const needs = { category: 'action', kind: 'review', push: true } as unknown as Classification;
	const at = '2026-09-20T00:00:00Z';
	it('is FYI (and not pushed) until the thread changes', () => {
		const row = { override: 'fyi', override_updated_at: at };
		expect(withOverride(needs, row, at)).toMatchObject({ category: 'fyi', push: false });
		expect(withOverride(needs, row, '2026-09-21T00:00:00Z').category).toBe('action');
		expect(withOverride(needs, { override: null, override_updated_at: null }, at)).toBe(needs);
	});
	it('leaves FYI and muted threads as they are', () => {
		const muted = { ...needs, category: 'muted' } as Classification;
		expect(withOverride(muted, { override: 'fyi', override_updated_at: at }, at)).toBe(muted);
	});
});
