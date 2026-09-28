import { describe, expect, it } from 'vitest';
import {
	classify,
	globToRegExp,
	ruleTriage,
	shouldPush,
	validateRules,
	withOverride
} from './classify';
import { DEFAULT_SETTINGS } from './settings';
import type { Classification, Enrichment, Settings, ThreadFacts } from './types';

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

describe('rules', () => {
	it('first matching rule wins and can mute', () => {
		const c = run(
			facts({ reason: 'review_requested', enrichment: pr({ reviewRequestedFromMe: true }) }),
			{
				rules: [
					{ name: 'mute docs', when: 'repo:acme/website', then: { category: 'muted' } },
					{
						name: 'quiet acme',
						when: 'repo:acme/* needs:review',
						then: { push: false }
					},
					{ name: 'never reached', when: '', then: { category: 'muted' } }
				]
			}
		);
		expect(c).toMatchObject({ category: 'action', rule: 'quiet acme', push: false });
		expect(shouldPush(c, DEFAULT_SETTINGS)).toBe(false);
	});

	it('skips disabled rules', () => {
		const c = run(facts(), { rules: [{ enabled: false, when: '', then: { category: 'muted' } }] });
		expect(c.category).toBe('fyi');
	});

	it('validates rule shape', () => {
		expect(validateRules([{ when: '', then: { category: 'action' } }])).toBeNull();
		expect(validateRules({})).toMatch(/array/);
		// The query is text; a part that Hush does not understand is an error, not a silent miss.
		expect(validateRules([{ when: { repo: 'acme/*' }, then: { category: 'fyi' } }])).toMatch(
			/"when" must be a query/
		);
		expect(validateRules([{ when: 'nope:1', then: { push: true } }])).toMatch(/nope/);
		expect(validateRules([{ when: 'x'.repeat(301), then: { push: true } }])).toMatch(/300/);
		expect(validateRules([{ when: '-author:bots', then: { category: 'fyi' } }])).toBeNull();
		expect(validateRules([{ when: '', then: {} }])).toMatch(/needs category, push, or triage/);
		expect(validateRules([{ when: 'is:merged', then: { triage: 'done' } }])).toBeNull();
		expect(validateRules([{ when: 'is:gone', then: { triage: 'done' } }])).toBeTruthy();
		expect(validateRules([{ when: '', then: { triage: 'snooze', snoozeHours: 4 } }])).toBeNull();
		expect(validateRules([{ when: '', then: { triage: 'later' } }])).toBeTruthy();
		for (const snoozeHours of [0, 1.5, 721])
			expect(validateRules([{ when: '', then: { triage: 'snooze', snoozeHours } }])).toBeTruthy();
	});

	it('matches on state', () => {
		const rules = [{ name: 'merged', when: 'is:merged', then: { triage: 'done' as const } }];
		expect(run(facts({ enrichment: pr({ state: 'merged' }) }), { rules }).rule).toBe('merged');
		expect(run(facts(), { rules }).rule).toBeUndefined();
		expect(run(facts({ enrichment: null }), { rules }).rule).toBeUndefined();
	});

	it('ruleTriage moves only for rules that ask', () => {
		const now = 1_000_000;
		const done = run(facts(), { rules: [{ name: 'x', when: '', then: { triage: 'done' } }] });
		expect(ruleTriage(done, now)).toEqual({ triage: 'done', note: 'Rule: x' });
		const snooze = run(facts(), {
			rules: [{ when: '', then: { triage: 'snooze', snoozeHours: 4 } }]
		});
		expect(ruleTriage(snooze, now)).toEqual({
			triage: 'snoozed',
			until: now + 4 * 3_600_000,
			note: 'Rule: Rule 1'
		});
		const day = run(facts(), { rules: [{ when: '', then: { triage: 'snooze' } }] });
		expect(ruleTriage(day, now)).toMatchObject({ until: now + 24 * 3_600_000 });
		expect(
			ruleTriage(run(facts(), { rules: [{ when: '', then: { push: true } }] }), now)
		).toBeNull();
		expect(ruleTriage(run(facts()), now)).toBeNull();
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
		const rules = [{ name: 'ci bots', when: 'from:github-*', then: { triage: 'done' as const } }];
		expect(run(mine({ lastComment: bot }), { rules }).rule).toBe('ci bots');
		const people = [{ name: 'people', when: '-from:bots', then: { category: 'action' as const } }];
		expect(run(mine({ lastComment: bot }), { rules: people }).rule).toBeUndefined();
		expect(
			run(mine({ lastComment: { ...bot, author: 'alice', authorIsBot: false } }), { rules: people })
				.rule
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
