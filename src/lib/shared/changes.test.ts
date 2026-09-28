import { describe, expect, it } from 'vitest';
import { changesSince, snapshotOf } from './changes';
import type { SubjectFacts } from './subject';

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
