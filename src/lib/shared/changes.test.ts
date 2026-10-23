import { describe, expect, it } from 'vitest';
import { changesSince, snapshotOf, withChangesSinceOpening } from './changes';
import type { SubjectFacts } from './subject';
import type { Change } from './types';

const facts = (over: Partial<SubjectFacts> = {}): SubjectFacts => ({
	id: 'n',
	kind: 'pr',
	repo: 'acme/web',
	number: 7,
	title: 'Fix login',
	url: 'https://github.com/acme/web/pull/7',
	author: 'alice',
	authorAvatar: null,
	authorIsBot: false,
	createdAt: '2026-09-01T00:00:00Z',
	updatedAt: '2026-09-02T00:00:00Z',
	state: 'open',
	draft: false,
	labels: [],
	assignees: [],
	comments: 2,
	commits: 3,
	lastComment: null,
	ci: 'PENDING',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	additions: 1,
	deletions: 1,
	lastCommitAt: null,
	reviewRequests: [],
	requestEvents: [],
	myReview: null,
	latestReview: null,
	verdicts: [],
	openThreads: 0,
	...over
});
const texts = (before: SubjectFacts, now: SubjectFacts) =>
	changesSince(snapshotOf(before, 'ian'), now, 'ian').map((c) => c.text);

describe('since you looked', () => {
	it('lists what changed, most important first', () => {
		const now = facts({
			commits: 5,
			comments: 3,
			ci: 'FAILURE',
			verdicts: [{ by: 'bob', at: '2026-09-03T00:00:00Z', state: 'APPROVED' }],
			labels: [{ name: 'bug', color: 'f00' }]
		});
		expect(texts(facts(), now)).toEqual([
			'@bob approved',
			'+2 commits',
			'CI fails',
			'1 new comment',
			'+bug'
		]);
	});

	it('is empty when nothing changed, and leaves out your own review', () => {
		expect(texts(facts(), facts())).toEqual([]);
		const mine = facts({
			verdicts: [{ by: 'ian', at: '2026-09-03T00:00:00Z', state: 'APPROVED' }]
		});
		expect(texts(facts(), mine)).toEqual([]);
	});

	it('does not count commits from facts stored before the count existed', () => {
		expect(texts(facts({ commits: undefined }), facts({ commits: 37 }))).toEqual([]);
	});
});

describe('draft changes', () => {
	it('says when someone else’s PR is ready for review', () => {
		expect(texts(facts({ draft: true }), facts())).toContain('Ready for review');
	});
	it('says nothing when your own PR leaves draft (you did it)', () => {
		expect(texts(facts({ author: 'ian', draft: true }), facts({ author: 'ian' }))).not.toContain(
			'Ready for review'
		);
	});
});

describe('changes since opening', () => {
	const comments: Change = { kind: 'comments', text: '2 new comments', tone: null };
	const oneComment: Change = { kind: 'comments', text: '1 new comment', tone: null };
	const ciRunning: Change = { kind: 'ci', text: 'CI running', tone: null };
	const ciFails: Change = { kind: 'ci', text: 'CI fails', tone: 'bad' };
	const merged: Change = { kind: 'state', text: 'Merged', tone: 'good' };

	it('keeps the opening changes after the seen mark clears them', () => {
		expect(withChangesSinceOpening([ciRunning, comments], [])).toEqual([ciRunning, comments]);
	});

	it('adds changes that come after the opening, in order of importance', () => {
		expect(withChangesSinceOpening([comments], [merged])).toEqual([merged, comments]);
	});

	it('shows the latest state of a kind that changed again', () => {
		expect(withChangesSinceOpening([ciRunning, comments], [ciFails])).toEqual([ciFails, comments]);
	});

	it('keeps each reviewer apart, and shows the latest verdict of the same reviewer', () => {
		const aliceApproved: Change = {
			kind: 'review',
			text: '@alice approved',
			tone: 'good',
			reviewer: 'alice'
		};
		const bobRequested: Change = {
			kind: 'review',
			text: '@bob requested changes',
			tone: 'bad',
			reviewer: 'bob'
		};
		const aliceRequested: Change = {
			kind: 'review',
			text: '@alice requested changes',
			tone: 'bad',
			reviewer: 'alice'
		};
		expect(withChangesSinceOpening([aliceApproved], [bobRequested])).toEqual([
			aliceApproved,
			bobRequested
		]);
		expect(withChangesSinceOpening([aliceApproved], [aliceRequested])).toEqual([aliceRequested]);
	});

	it('keeps the count from the opening when more of the same come', () => {
		expect(withChangesSinceOpening([comments], [oneComment])).toEqual([comments]);
	});
});
