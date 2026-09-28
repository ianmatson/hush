import { describe, expect, it } from 'vitest';
import { globToRegExp, place, shouldPush, validateRules } from './place';
import { DEFAULT_SETTINGS } from './settings';
import type { Enrichment, ItemFacts, Rule, Settings } from './types';
import type { SubjectFacts } from './subject';

const pr = (e: Partial<Enrichment> = {}): Enrichment => ({
	kind: 'pr',
	number: 7,
	url: 'https://github.com/o/r/pull/7',
	state: 'open',
	author: 'alice',
	...e
});

const facts = (over: Partial<ItemFacts> = {}): ItemFacts => ({
	repo: 'acme/web',
	subjectType: 'PullRequest',
	title: 'Add thing',
	reason: 'subscribed',
	htmlUrl: 'https://github.com/o/r/pull/7',
	enrichment: pr(),
	me: 'ian',
	...over
});

const run = (f: ItemFacts, s: Partial<Settings> = {}) => place(f, { ...DEFAULT_SETTINGS, ...s });

describe('lanes', () => {
	it('puts a direct review request in Your turn, where others wait on you', () => {
		const c = run(
			facts({ reason: 'review_requested', enrichment: pr({ reviewRequestedFromMe: true }) })
		);
		expect(c).toMatchObject({
			lane: 'turn',
			section: 'others',
			needs: 'review',
			actionUrl: 'https://github.com/o/r/pull/7/files'
		});
	});

	it('puts problems on my own PR in Your turn, as my work', () => {
		const c = run(
			facts({
				reason: 'author',
				enrichment: pr({ author: 'ian', ci: 'FAILURE', reviewDecision: 'APPROVED' })
			})
		);
		expect(c).toMatchObject({ lane: 'turn', section: 'work', needs: 'fix_ci' });
	});

	it('says my approved, green PR is ready to merge, and not while CI runs', () => {
		const mine = (ci: 'SUCCESS' | 'PENDING') =>
			run(
				facts({
					reason: 'author',
					enrichment: pr({ author: 'ian', ci, reviewDecision: 'APPROVED' })
				})
			);
		expect(mine('SUCCESS').needs).toBe('merge');
		expect(mine('PENDING')).toMatchObject({ lane: 'waiting', waitingOn: 'CI' });
	});

	it('puts my PR that waits for review in Waiting, on the reviewers', () => {
		const subject: SubjectFacts = {
			id: 'x',
			kind: 'pr',
			repo: 'acme/web',
			number: 7,
			title: 'Add thing',
			url: 'https://github.com/o/r/pull/7',
			author: 'ian',
			authorAvatar: null,
			authorIsBot: false,
			createdAt: '2026-09-20T00:00:00Z',
			updatedAt: '2026-09-21T00:00:00Z',
			state: 'open',
			draft: false,
			labels: [],
			assignees: [],
			comments: 0,
			commits: 1,
			lastComment: null,
			ci: 'SUCCESS',
			reviewDecision: 'REVIEW_REQUIRED',
			mergeable: 'MERGEABLE',
			additions: 1,
			deletions: 1,
			lastCommitAt: '2026-09-20T00:00:00Z',
			reviewRequests: [
				{ team: false, name: 'dave' },
				{ team: true, name: 'acme/web-core' }
			],
			requestEvents: [],
			myReview: null,
			latestReview: null,
			verdicts: [],
			openThreads: 0
		};
		const c = run(facts({ reason: 'author', subject, enrichment: pr({ author: 'ian' }) }));
		expect(c).toMatchObject({ lane: 'waiting', reason: 'Waiting for review' });
		expect(c.waitingOn).toBe('@dave, acme/web-core');
	});

	it('puts team review requests in Waiting, or Your turn with the setting on', () => {
		const f = facts({
			repo: 'acme/web',
			reason: 'review_requested',
			enrichment: pr({ requestedTeams: ['web'] }),
			myTeams: ['acme/web']
		});
		expect(run(f)).toMatchObject({ lane: 'waiting', waitingOn: 'acme/web' });
		expect(run(f, { teamReviewsAreMine: true })).toMatchObject({ lane: 'turn', needs: 'review' });
	});

	it('puts merged and closed work, and others’ drafts, in Updates', () => {
		expect(run(facts({ reason: 'mention', enrichment: pr({ state: 'merged' }) })).lane).toBe(
			'updates'
		);
		expect(run(facts({ enrichment: pr({ draft: true }) }))).toMatchObject({
			lane: 'updates',
			reason: 'Draft'
		});
	});

	it('waits on the author after my own last comment', () => {
		const lastComment = {
			author: 'ian',
			authorIsBot: false,
			body: 'done',
			url: 'u',
			createdAt: ''
		};
		expect(run(facts({ reason: 'comment', enrichment: pr({ lastComment }) }))).toMatchObject({
			lane: 'waiting',
			reason: 'Waiting for a reply',
			waitingOn: '@alice'
		});
	});

	it('treats bots as updates, unless a bot PR asks me by name', () => {
		const lastComment = {
			author: 'codecov[bot]',
			authorIsBot: true,
			body: 'coverage',
			url: 'u',
			createdAt: '2026-09-20T00:00:00Z'
		};
		const f = facts({ reason: 'author', enrichment: pr({ author: 'ian', lastComment }) });
		expect(run(f).lane).not.toBe('turn');
		expect(run(f, { botsAreUpdates: false }).needs).toBe('reply');
		const botPr = (e: Partial<Enrichment>) =>
			run(
				facts({
					reason: 'review_requested',
					enrichment: pr({ author: 'copilot-swe-agent[bot]', ...e })
				})
			);
		expect(botPr({}).lane).toBe('updates');
		expect(botPr({ reviewRequestedFromMe: true })).toMatchObject({ lane: 'turn', needs: 'review' });
	});

	it('treats a bot mention as an update, a human mention as my turn', () => {
		const bot = { author: 'github-actions', authorIsBot: true, body: '', url: 'u', createdAt: '' };
		expect(run(facts({ reason: 'mention', enrichment: pr({ lastComment: bot }) })).lane).toBe(
			'updates'
		);
		const human = { ...bot, author: 'bob', authorIsBot: false };
		expect(run(facts({ reason: 'mention', enrichment: pr({ lastComment: human }) }))).toMatchObject(
			{
				lane: 'turn',
				section: 'others',
				reason: 'Mentioned'
			}
		);
	});

	it('puts a PR assigned to me in my work', () => {
		expect(run(facts({ reason: 'assign', enrichment: pr({ assignedToMe: true }) }))).toMatchObject({
			needs: 'triage',
			section: 'work'
		});
	});

	it('puts failed workflow runs in Your turn', () => {
		const c = run(
			facts({
				subjectType: 'CheckSuite',
				title: 'CI workflow run failed for main branch',
				enrichment: null,
				reason: 'ci_activity'
			})
		);
		expect(c).toMatchObject({ lane: 'turn', needs: 'fix_ci', reason: 'A workflow run failed' });
	});
});

describe('rules', () => {
	const request = facts({
		reason: 'review_requested',
		enrichment: pr({ reviewRequestedFromMe: true })
	});

	it('first matching rule wins, and can move, push, or mute', () => {
		const rules: Rule[] = [
			{ name: 'mute docs', when: 'repo:acme/website', then: { mute: true } },
			{ name: 'quiet acme', when: 'repo:acme/* needs:review', then: { push: false } },
			{ name: 'never reached', when: '', then: { mute: true } }
		];
		const c = run(request, { rules });
		expect(c).toMatchObject({ lane: 'turn', rule: 'quiet acme', push: false });
		expect(shouldPush(c, DEFAULT_SETTINGS)).toBe(false);
		expect(run(facts({ repo: 'acme/website' }), { rules }).lane).toBe('muted');
		expect(run(facts(), { rules: [{ when: 'repo:acme/*', then: { lane: 'turn' } }] }).lane).toBe(
			'turn'
		);
		expect(run(request, { rules: [{ when: 'in:turn', then: { lane: 'updates' } }] }).lane).toBe(
			'updates'
		);
	});

	it('skips disabled rules', () => {
		expect(run(facts(), { rules: [{ enabled: false, when: '', then: { mute: true } }] }).lane).toBe(
			'updates'
		);
	});

	it('pushes Your turn by default, and what a rule says', () => {
		expect(shouldPush(run(request), DEFAULT_SETTINGS)).toBe(true);
		expect(shouldPush(run(request), { push: false })).toBe(false);
		expect(
			shouldPush(run(facts(), { rules: [{ when: '', then: { push: true } }] }), DEFAULT_SETTINGS)
		).toBe(true);
	});

	it('validates rule shape', () => {
		expect(validateRules([{ when: 'repo:acme/*', then: { lane: 'updates' } }])).toBeNull();
		expect(validateRules({})).toMatch(/array/);
		expect(validateRules([{ when: { repo: 'x' }, then: { push: true } }])).toMatch(
			/must be a query/
		);
		expect(validateRules([{ when: 'needs:nope', then: { push: true } }])).toMatch(/Unknown/);
		expect(validateRules([{ when: 'is:done', then: { push: true } }])).toMatch(/only in searches/);
		expect(validateRules([{ when: '', then: {} }])).toMatch(
			/needs lane, push, mute, or snoozeHours/
		);
		expect(validateRules([{ when: '', then: { lane: 'fyi' } }])).toMatch(/"turn" or "updates"/);
		expect(validateRules([{ when: '', then: { category: 'fyi' } }])).toMatch(
			/unknown "then.category"/
		);
		expect(validateRules([{ when: '', then: { snoozeHours: 4 } }])).toBeNull();
		for (const snoozeHours of [0, 1.5, 721])
			expect(validateRules([{ when: '', then: { snoozeHours } }])).toBeTruthy();
	});

	it('matches on state, and on who did the latest activity', () => {
		const merged = [{ name: 'merged', when: 'is:merged', then: { lane: 'updates' as const } }];
		expect(run(facts({ enrichment: pr({ state: 'merged' }) }), { rules: merged }).rule).toBe(
			'merged'
		);
		expect(run(facts(), { rules: merged }).rule).toBeUndefined();
		const bot = {
			author: 'github-actions',
			authorIsBot: true,
			body: '',
			url: 'u',
			createdAt: '2026-09-28T10:00:00Z'
		};
		const mine = facts({ reason: 'author', enrichment: pr({ author: 'ian', lastComment: bot }) });
		expect(
			run(mine, { rules: [{ name: 'ci', when: 'from:github-*', then: { mute: true } }] }).rule
		).toBe('ci');
		expect(
			run(mine, { rules: [{ name: 'people', when: '-from:bots', then: { mute: true } }] }).rule
		).toBeUndefined();
	});

	it('globs match owner/repo case-insensitively', () => {
		expect(globToRegExp('ACME/*').test('acme/web')).toBe(true);
		expect(globToRegExp('acme/web').test('acme/website')).toBe(false);
	});
});

describe('what the row says', () => {
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
		expect(run(mine({ lastComment: bot, reviewDecision: 'APPROVED', ci: 'PENDING' })).summary).toBe(
			'CI running'
		);
		expect(run(facts({ enrichment: pr({ state: 'merged' }) })).summary).toBe('PR merged');
	});
});
