import { describe, expect, it } from 'vitest';
import { computeTurn, expandSearches, type TurnFacts } from './turn';
import { DEFAULT_SEARCHES } from './settings';

type DashFacts = TurnFacts;
const base = (over: Partial<DashFacts> = {}): DashFacts => ({
	kind: 'pr',
	url: 'https://github.com/o/r/pull/1',
	author: 'alice',
	authorIsBot: false,
	createdAt: '2026-09-01T00:00:00Z',
	updatedAt: '2026-09-20T00:00:00Z',
	state: 'open',
	draft: false,
	comments: 0,
	lastCommentBy: null,
	lastCommentAt: null,
	lastCommentIsBot: false,
	assignees: [],
	ci: 'SUCCESS',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	requestedMe: false,
	requestedTeams: [],
	openThreads: 0,
	lastVerdictBy: null,
	lastVerdictAt: null,
	requestedAt: null,
	myLastReviewAt: null,
	myLastReviewState: null,
	lastCommitAt: '2026-09-02T00:00:00Z',
	...over
});

const turn = (f: Partial<DashFacts>) => computeTurn(base(f), 'ian', []);

describe('computeTurn: pull requests', () => {
	it('a direct review request is your turn and links to the diff', () => {
		expect(turn({ requestedMe: true })).toMatchObject({
			turn: 'you',
			turnReason: 'Review requested',
			actionUrl: 'https://github.com/o/r/pull/1/files'
		});
	});

	it('a team review request is the team turn', () => {
		expect(turn({ requestedTeams: ['o/web'] })).toMatchObject({
			turn: 'team',
			turnReason: 'Review for o/web'
		});
	});

	it('a direct request wins over a team request', () => {
		expect(turn({ requestedMe: true, requestedTeams: ['o/web'] }).turn).toBe('you');
	});

	it('new commits after my review make it my turn again', () => {
		const r = turn({
			myLastReviewAt: '2026-09-03T00:00:00Z',
			lastCommitAt: '2026-09-05T00:00:00Z'
		});
		expect(r).toMatchObject({ turn: 'you', turnReason: 'New commits since your review' });
	});

	it('after my review with no new commits, it waits on the author', () => {
		const r = turn({ myLastReviewAt: '2026-09-05T00:00:00Z', myLastReviewState: 'APPROVED' });
		expect(r).toMatchObject({ turn: 'them', turnReason: 'You approved' });
	});

	it('my PR: CI failure first, then waiting for review', () => {
		expect(turn({ author: 'ian', ci: 'FAILURE' })).toMatchObject({
			turn: 'you',
			actionLabel: 'Fix CI'
		});
		expect(turn({ author: 'ian' })).toMatchObject({
			turn: 'them',
			turnReason: 'Waiting for review'
		});
		expect(turn({ author: 'ian', draft: true }).turn).toBe('none');
	});

	it('my PR: a human comment after my last commit is my turn', () => {
		const r = turn({ author: 'ian', lastCommentBy: 'bob', lastCommentAt: '2026-09-10T00:00:00Z' });
		expect(r).toMatchObject({ turn: 'you', turnReason: '@bob commented' });
	});
});

describe('computeTurn: issues', () => {
	const issue = (f: Partial<DashFacts>) => turn({ kind: 'issue', ci: null, ...f });
	it('assigned is your turn, and a reply raises the priority', () => {
		expect(issue({ assignees: ['ian'] })).toMatchObject({ turn: 'you', priority: 3 });
		expect(
			issue({ assignees: ['ian'], lastCommentBy: 'bob', lastCommentAt: '2026-09-10T00:00:00Z' })
		).toMatchObject({ priority: 1 });
	});
	it('my last comment means I wait', () => {
		expect(issue({ lastCommentBy: 'ian' }).turn).toBe('them');
	});
});

describe('expandSearches', () => {
	const teams = [
		{ slug: 'o/web', name: 'Web', org: 'o' },
		{ slug: 'o/infra', name: 'Infra', org: 'o' }
	];
	it('runs @team once per tracked team and appends the scope', () => {
		const { queries } = expandSearches(
			[{ id: 't', name: 'T', query: 'is:pr team-review-requested:@team', enabled: true }],
			{ scope: 'org:o', excludedTeams: ['o/infra'] },
			teams
		);
		expect(queries).toEqual([
			{ section: 't', team: 'o/web', q: 'is:pr team-review-requested:o/web org:o' }
		]);
	});
	it('skips disabled searches and explains team searches without teams', () => {
		const { queries, skipped } = expandSearches(
			DEFAULT_SEARCHES,
			{ scope: 'archived:false', excludedTeams: [] },
			[]
		);
		expect(queries.some((q) => q.section === 'mentions')).toBe(false);
		expect(skipped['review-team']).toMatch(/team/);
	});
});

describe('computeTurn: bots and drafts', () => {
	it('a bot PR is an update, unless it asks you by name', () => {
		const bot = { author: 'copilot-swe-agent[bot]', authorIsBot: true };
		expect(computeTurn(base(bot), 'ian', [], { botsAreUpdates: true }).turn).toBe('none');
		expect(
			computeTurn(base({ ...bot, requestedMe: true }), 'ian', [], { botsAreUpdates: true }).turn
		).toBe('you');
	});
	it("someone else's draft is nobody's turn, unless it asks you by name", () => {
		expect(turn({ draft: true, requestedTeams: ['o/web'] })).toMatchObject({
			turn: 'none',
			turnReason: 'Draft'
		});
		expect(turn({ draft: true, requestedMe: true }).turn).toBe('you');
	});
});
