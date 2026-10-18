import { describe, expect, it } from 'vitest';
import { itemQueryFacts } from './categories';
import { finishItem } from './dashboard';
import { groupItems } from './grouping';
import { queryMatches } from './rules';
import { dashFactsOf, enrichmentOf, subjectRuleFacts, type SubjectFacts } from './subject';
import type { LastComment } from './types';

const ME = 'ian';
const T0 = '2026-09-10T00:00:00Z';
const T1 = '2026-09-11T00:00:00Z';
const T2 = '2026-09-12T00:00:00Z';

function pr(over: Partial<SubjectFacts> = {}): SubjectFacts {
	return {
		id: 'PR_1',
		kind: 'pr',
		repo: 'acme/website',
		number: 1,
		title: 'Fix it',
		url: 'https://github.com/acme/website/pull/1',
		author: 'alice',
		authorAvatar: null,
		authorIsBot: false,
		createdAt: T0,
		updatedAt: T2,
		state: 'open',
		draft: false,
		labels: [{ name: 'website', color: 'ededed' }],
		assignees: [],
		comments: 0,
		lastComment: null,
		ci: 'SUCCESS',
		reviewDecision: 'REVIEW_REQUIRED',
		mergeable: 'MERGEABLE',
		additions: 2,
		deletions: 1,
		lastCommitAt: T0,
		reviewRequests: [],
		requestEvents: [],
		myReview: null,
		latestReview: null,
		verdicts: [],
		openThreads: 0,
		...over
	};
}

describe('views of one subject', () => {
	it('the facts keep review requests, assignees, and labels', () => {
		const e = enrichmentOf(
			pr({
				reviewRequests: [
					{ team: false, name: 'Ian' },
					{ team: true, name: 'acme/website' }
				],
				assignees: ['IAN']
			})
		);
		expect(e).toMatchObject({
			reviewRequests: ['Ian', 'acme/website'],
			assignees: ['IAN'],
			labels: ['website']
		});
	});

	it('the dashboards count only your teams, and wait since the request for you', () => {
		const s = pr({
			reviewRequests: [
				{ team: true, name: 'acme/website' },
				{ team: true, name: 'acme/other' }
			],
			requestEvents: [
				{ at: T0, team: true, name: 'acme/website' },
				{ at: T1, team: true, name: 'acme/other' }
			]
		});
		const d = dashFactsOf(s, ME, new Set(['acme/website']));
		expect(d.requestedTeams).toEqual(['acme/website']);
		expect(d.requestedAt).toBe(T0);
		expect(dashFactsOf(s, ME, new Set()).requestedAt).toBeNull();
	});

	it('an issue keeps only issue facts', () => {
		const e = enrichmentOf(
			pr({ kind: 'issue', state: 'closed', url: 'https://github.com/o/r/issues/1' })
		);
		expect(e.state).toBe('closed');
		expect(e).not.toHaveProperty('ci');
		expect(e).not.toHaveProperty('reviewed');
	});
});

const comment = (author: string, createdAt: string, authorIsBot = false): LastComment => ({
	author,
	authorIsBot,
	body: '',
	url: '',
	createdAt
});

const itemOf = (s: SubjectFacts, teams = new Set<string>()) =>
	finishItem(dashFactsOf(s, ME, teams), [], [], ME, 3);

describe('rule facts', () => {
	const probe = pr({
		author: 'dan',
		lastComment: comment('bob', T1),
		latestReview: {
			author: 'copilot-pull-request-reviewer',
			authorIsBot: true,
			at: T2,
			state: 'COMMENTED'
		},
		reviewRequests: [
			{ team: false, name: 'alice' },
			{ team: true, name: 'acme/web' }
		]
	});
	const QUERIES = [
		'from:copilot*',
		'from:bob',
		'from:bots',
		'-from:bots',
		'review-requested:alice',
		'review-requested:acme/web',
		'review-requested:@me',
		'repo:acme/* is:pr is:open -is:draft',
		'author:dan -author:bots',
		'label:web* no:assignee',
		'review:none',
		'review:required status:success size:<10 comments:0',
		'type:issue OR fix'
	];

	it('match the same on the server and in the browser', () => {
		const server = subjectRuleFacts(probe, ME);
		const browser = itemQueryFacts(itemOf(probe), ME, { categoryGroups: [] });
		for (const q of QUERIES) expect(queryMatches(q, browser), q).toBe(queryMatches(q, server));
		expect(queryMatches('from:copilot*', browser)).toBe(true);
		expect(queryMatches('from:bob', browser)).toBe(false);
		expect(queryMatches('review-requested:alice', browser)).toBe(true);
	});
});

describe('review decision', () => {
	const verdict = (by: string, state: string) => ({ by, at: T1, state });
	const decisionOf = (s: SubjectFacts) => dashFactsOf(s, ME, new Set()).reviewDecision;

	it('comes from the verdicts when the repository does not require reviews', () => {
		const approved = pr({ reviewDecision: null, verdicts: [verdict('bob', 'APPROVED')] });
		expect(decisionOf(approved)).toBe('APPROVED');
		expect(enrichmentOf(approved).reviewDecision).toBe('APPROVED');
		expect(
			decisionOf(
				pr({
					reviewDecision: null,
					verdicts: [verdict('bob', 'APPROVED'), verdict('carol', 'CHANGES_REQUESTED')]
				})
			)
		).toBe('CHANGES_REQUESTED');
		expect(decisionOf(pr({ reviewDecision: null, verdicts: [verdict('bob', 'DISMISSED')] }))).toBe(
			null
		);
	});

	it("keeps GitHub's decision when there is one", () => {
		expect(
			decisionOf(pr({ reviewDecision: 'REVIEW_REQUIRED', verdicts: [verdict('bob', 'APPROVED')] }))
		).toBe('REVIEW_REQUIRED');
	});

	it('shows an approval in the turn, the rules, and the status sections', () => {
		const approved = pr({
			author: ME,
			reviewDecision: null,
			verdicts: [verdict('bob', 'APPROVED')]
		});
		const item = itemOf(approved);
		expect(item.turnReason).toBe('Ready to merge');
		expect(queryMatches('review:approved', subjectRuleFacts(approved, ME))).toBe(true);
		expect(
			groupItems([item], 'status', { me: ME, categoryGroups: [] }).map((s) => s.label)
		).toEqual(['Approved']);
	});
});

describe('the newest human comment', () => {
	it('is not hidden by a bot comment after it', () => {
		const issue = pr({
			kind: 'issue',
			author: ME,
			comments: 2,
			previousComment: comment('alice', T1),
			lastComment: comment('ci-bot', T2, true)
		});
		expect(itemOf(issue)).toMatchObject({ turn: 'you', turnReason: '@alice replied' });
		const waiting = { ...issue, previousComment: comment(ME, T1) };
		expect(itemOf({ ...waiting, author: 'alice' })).toMatchObject({
			turn: 'them',
			turnReason: 'Waiting for a reply'
		});
	});
});
