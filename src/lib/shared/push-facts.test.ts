import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PUSH_FACTS,
	factEvents,
	itemPush,
	knownPushFacts,
	validatePushFacts,
	type PushFact
} from './push-facts';
import { eventSnoozeDeadline, MUTED_AT, type ItemMark } from './item-snooze';
import type { SubjectFacts } from './subject';

const ME = 'ian';
const TEAMS = new Set(['acme/web']);
const NOW = Date.parse('2026-10-09T12:00:00Z');
const SINCE = NOW - 3600_000;
const LONG_AGO = '2026-09-01T00:00:00Z';
const JUST_NOW = '2026-10-09T11:50:00Z';

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
	createdAt: LONG_AGO,
	updatedAt: LONG_AGO,
	state: 'open',
	draft: false,
	labels: [],
	assignees: [],
	comments: 0,
	commits: 1,
	lastComment: null,
	ci: 'PENDING',
	reviewDecision: null,
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

const comment = (author: string, createdAt = JUST_NOW) => ({
	author,
	authorIsBot: false,
	body: 'ok',
	url: 'https://github.com/acme/web/pull/7#c',
	createdAt
});

const titles = (before: SubjectFacts | null, after: SubjectFacts) =>
	factEvents(before, after, ME, TEAMS, SINCE).map((e) => `${e.fact}: ${e.title}`);

describe('push facts', () => {
	it('pushes a review request by name, and one for your team', () => {
		const requested = facts({
			reviewRequests: [
				{ team: false, name: 'IAN' },
				{ team: true, name: 'acme/web' }
			]
		});
		expect(titles(facts(), requested)).toEqual([
			'review-requested: Review requested',
			'team-review-requested: Review requested from acme/web'
		]);
		expect(titles(requested, requested)).toEqual([]);
	});

	it('pushes a request on an item it reads for the first time only when the request is new', () => {
		const requested = (at: string) =>
			facts({
				reviewRequests: [{ team: false, name: ME }],
				requestEvents: [{ at, team: false, name: ME }]
			});
		expect(titles(null, requested(JUST_NOW))).toEqual(['review-requested: Review requested']);
		expect(titles(null, requested(LONG_AGO))).toEqual([]);
	});

	it('pushes reviews, CI, and replies on your pull request', () => {
		const mine = facts({ author: ME, ci: 'SUCCESS' });
		const review = (state: string) => ({ author: 'bob', at: JUST_NOW, state });
		expect(titles(mine, { ...mine, latestReview: review('APPROVED') })).toEqual([
			'approved: Approved by bob'
		]);
		expect(titles(mine, { ...mine, latestReview: review('CHANGES_REQUESTED') })).toEqual([
			'changes-requested: bob requested changes'
		]);
		expect(titles(mine, { ...mine, latestReview: review('COMMENTED') })).toEqual([
			'replied: bob reviewed'
		]);
		expect(titles(mine, { ...mine, ci: 'FAILURE' })).toEqual(['ci-failed: CI failed']);
		expect(titles({ ...mine, ci: 'FAILURE' }, mine)).toEqual(['ci-passed: CI passed']);
		expect(titles(mine, { ...mine, lastComment: comment('bob') })).toEqual([
			'replied: bob replied'
		]);
	});

	it('does not push reviews and CI on pull requests of others, or your own actions', () => {
		const theirs = facts({ ci: 'SUCCESS' });
		expect(
			titles(theirs, {
				...theirs,
				ci: 'FAILURE',
				latestReview: { author: 'bob', at: JUST_NOW, state: 'APPROVED' }
			})
		).toEqual([]);
		const mine = facts({ author: ME });
		expect(titles(mine, { ...mine, lastComment: comment(ME) })).toEqual([]);
		expect(
			titles(mine, { ...mine, lastComment: { ...comment('dependabot'), authorIsBot: true } })
		).toEqual([]);
	});

	it('pushes a reply right after your comment on an item of someone else', () => {
		const before = facts({ lastComment: comment(ME, LONG_AGO) });
		expect(
			titles(before, {
				...before,
				lastComment: comment('bob'),
				previousComment: comment(ME, LONG_AGO)
			})
		).toEqual(['replied: bob replied']);
		expect(titles(before, { ...before, lastComment: comment('bob') })).toEqual([]);
	});

	it('pushes when you are assigned', () => {
		const issue = facts({ kind: 'issue' });
		expect(titles(issue, { ...issue, assignees: ['ian'] })).toEqual(['assigned: Assigned to you']);
	});
});

describe('item pushes', () => {
	const wanted = new Set<PushFact>(DEFAULT_PUSH_FACTS);
	const mark = (over: Partial<ItemMark>): ItemMark => ({
		updatedAt: LONG_AGO,
		snoozedUntil: null,
		snoozeEvent: null,
		snoozedAt: NOW - 1000,
		...over
	});
	const mine = facts({ author: ME });
	const failed = { ...mine, ci: 'FAILURE' as const };
	const push = (m: ItemMark | undefined, before = mine, after: SubjectFacts = failed, w = wanted) =>
		itemPush(before, after, m, w, ME, TEAMS, SINCE, NOW);

	it('pushes the facts that you chose, as one push for each item', () => {
		expect(push(undefined)).toEqual({ reason: 'ci-failed', title: 'CI failed' });
		expect(push(undefined, mine, failed, new Set(['approved']))).toBeNull();
		expect(
			push(undefined, mine, {
				...failed,
				latestReview: { author: 'bob', at: JUST_NOW, state: 'APPROVED' }
			})
		).toEqual({ reason: 'approved', title: 'Approved by bob · CI failed' });
	});

	it('never pushes a muted item, nor one that sleeps until a time', () => {
		expect(push(mark({ updatedAt: MUTED_AT }))).toBeNull();
		expect(push(mark({ snoozedUntil: NOW + 3600_000 }))).toBeNull();
		expect(push(mark({ snoozedUntil: NOW - 1 }))).toEqual({
			reason: 'ci-failed',
			title: 'CI failed'
		});
	});

	it('pushes once when a snooze until something happens ends', () => {
		const snoozed = mark({
			snoozeEvent: 'ci_done',
			snoozedUntil: eventSnoozeDeadline(NOW - 1000)
		});
		expect(push(snoozed)).toEqual({ reason: 'snooze-over', title: 'Snooze over: CI finished' });
		expect(push(snoozed, failed, failed)).toBeNull();
		expect(push(snoozed, mine, { ...mine, lastComment: comment('bob') })).toBeNull();
	});
});

describe('the push facts setting', () => {
	it('accepts known facts once each, and loads only those', () => {
		expect(validatePushFacts(DEFAULT_PUSH_FACTS)).toBeNull();
		expect(validatePushFacts(['nope'])).toMatch(/unknown fact/);
		expect(validatePushFacts(['approved', 'approved'])).toMatch(/twice/);
		expect(validatePushFacts('approved')).toMatch(/list/);
		expect(knownPushFacts(['approved', 'nope', 'approved'])).toEqual(['approved']);
	});
});
