import { describe, expect, it } from 'vitest';
import {
	arrangeGroup,
	orderAfterDrop,
	computeTurn,
	DEFAULT_DASH,
	expandSections,
	keepItem,
	sortItems,
	validateDash,
	type DashFacts
} from './dashboard';
import { DEFAULT_SOURCES, sectionsFor } from './sources';

const base = (over: Partial<DashFacts> = {}): DashFacts => ({
	id: 'n1',
	kind: 'pr',
	number: 1,
	title: 'Add thing',
	url: 'https://github.com/o/r/pull/1',
	repo: 'o/r',
	author: 'alice',
	authorAvatar: null,
	authorIsBot: false,
	createdAt: '2026-09-01T00:00:00Z',
	updatedAt: '2026-09-20T00:00:00Z',
	state: 'open',
	draft: false,
	labels: [],
	comments: 0,
	lastCommentBy: null,
	lastCommentAt: null,
	lastCommentIsBot: false,
	assignees: [],
	ci: 'SUCCESS',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	additions: 10,
	deletions: 2,
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
	it("a bot's PR is FYI, unless it asks for your review by name", () => {
		const bot = { author: 'dependabot[bot]', authorIsBot: true };
		const opts = { botsAreFyi: true };
		expect(computeTurn(base(bot), 'ian', [], opts).turnReason).toBe('Bot PR');
		expect(computeTurn(base({ ...bot, requestedMe: true }), 'ian', [], opts)).toMatchObject({
			turn: 'you',
			turnReason: 'Review requested'
		});
	});

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

describe('expandSections', () => {
	const teams = [
		{ slug: 'o/web', name: 'Web', org: 'o' },
		{ slug: 'o/infra', name: 'Infra', org: 'o' }
	];
	it('runs @team once per tracked team and appends the scope', () => {
		const { queries } = expandSections(
			[{ id: 't', name: 'T', query: 'is:pr team:@team', enabled: true }],
			{ scope: 'org:o', excludedTeams: ['o/infra'] },
			teams
		);
		expect(queries).toEqual([{ section: 't', team: 'o/web', q: 'is:pr team:o/web org:o' }]);
	});
	it('runs team review requests as one search, filtered by the tracked teams', () => {
		const { queries, skipped } = expandSections(
			[{ id: 't', name: 'T', query: 'is:pr team-review-requested:@team', enabled: true }],
			{ scope: 'org:o', excludedTeams: ['o/infra'] },
			[...teams, ...Array.from({ length: 20 }, (_, i) => ({ slug: `o/t${i}`, name: '', org: 'o' }))]
		);
		expect(queries).toHaveLength(1);
		expect(queries[0].q).toBe('is:pr review-requested:@me org:o');
		expect(queries[0].teams).toHaveLength(21);
		expect(skipped).toEqual({});
	});
	it('skips disabled sections and explains team sections without teams', () => {
		const { queries, skipped } = expandSections(
			sectionsFor('pr', DEFAULT_SOURCES),
			DEFAULT_DASH,
			[]
		);
		expect(queries.some((q) => q.section === 'team-mentioned')).toBe(false);
		expect(skipped['review-team']).toMatch(/team/);
	});
});

describe('filters, sorting, validation', () => {
	it('hides drafts and bot PRs by others unless my review is requested', () => {
		expect(keepItem(base({ draft: true }), 'ian', DEFAULT_DASH)).toBe(false);
		expect(keepItem(base({ draft: true, author: 'ian' }), 'ian', DEFAULT_DASH)).toBe(true);
		expect(keepItem(base({ author: 'dependabot[bot]' }), 'ian', DEFAULT_DASH)).toBe(false);
		expect(
			keepItem(base({ author: 'dependabot[bot]', requestedMe: true }), 'ian', DEFAULT_DASH)
		).toBe(true);
	});
	it('sorts your turn first, then priority, then the longest wait', () => {
		const items = [
			{ id: 'a', turn: 'them' as const, priority: 0, waitingSince: '2026-01-01T00:00:00Z' },
			{ id: 'b', turn: 'you' as const, priority: 2, waitingSince: '2026-01-01T00:00:00Z' },
			{ id: 'c', turn: 'you' as const, priority: 0, waitingSince: '2026-09-01T00:00:00Z' },
			{ id: 'd', turn: 'you' as const, priority: 0, waitingSince: '2026-08-01T00:00:00Z' },
			{ id: 'e', turn: 'team' as const, priority: 0, waitingSince: '2026-01-01T00:00:00Z' }
		];
		expect(sortItems(items).map((i) => i.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
	});
	it('validates dashboard settings', () => {
		expect(validateDash(DEFAULT_DASH)).toBeNull();
		expect(validateDash({ ...DEFAULT_DASH, staleDays: 0 })).toMatch(/Stale/);
	});
});

describe('arrangeGroup and orderAfterDrop', () => {
	it('puts new (unranked) items first, then the manual order', () => {
		const items = [
			{ id: 'a', rank: 2 },
			{ id: 'b', rank: null },
			{ id: 'c', rank: 0 },
			{ id: 'd', rank: null }
		];
		expect(arrangeGroup(items).map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
	});

	it('places one moved item next to its visible neighbours', () => {
		// Full group a b c d e; filter shows only a c e; user drags e between a and c.
		expect(orderAfterDrop(['a', 'b', 'c', 'd', 'e'], ['a', 'e', 'c'], ['e'])).toEqual([
			'a',
			'e',
			'b',
			'c',
			'd'
		]);
	});

	it('moves a block of selected items together', () => {
		expect(orderAfterDrop(['a', 'b', 'c', 'd'], ['x', 'y', 'a', 'b'], ['x', 'y'])).toEqual([
			'x',
			'y',
			'a',
			'b',
			'c',
			'd'
		]);
		expect(orderAfterDrop(['a', 'b'], ['a', 'b', 'x', 'y'], ['x', 'y'])).toEqual([
			'a',
			'b',
			'x',
			'y'
		]);
	});

	it('drops into an empty group', () => {
		expect(orderAfterDrop([], ['x'], ['x'])).toEqual(['x']);
	});
});
