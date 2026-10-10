import { describe, expect, it } from 'vitest';
import {
	eventSnoozeDeadline,
	isUnread,
	markState,
	MUTED_AT,
	snoozeLabel,
	type ItemMark
} from './item-snooze';
import type { SubjectFacts } from './subject';

const ME = 'ian';
const SNOOZED_AT = Date.parse('2026-10-01T12:00:00Z');
const HOUR = 3600_000;

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
	updatedAt: '2026-10-01T12:00:00Z',
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

const mark = (over: Partial<ItemMark> = {}): ItemMark => ({
	updatedAt: '2026-10-01T12:00:00Z',
	snoozedUntil: null,
	snoozeEvent: null,
	snoozedAt: SNOOZED_AT,
	...over
});

const stateAt = (
	m: ItemMark | undefined,
	updatedAt: string,
	f = facts(),
	now = SNOOZED_AT + HOUR
) => markState(m, updatedAt, f, ME, now);

describe('item snoozes', () => {
	it('keeps an item in the list when it has no mark', () => {
		expect(stateAt(undefined, '2026-10-01T12:00:00Z')).toEqual({ kind: 'none' });
	});

	it('snoozes until new activity: the item comes back when it changes', () => {
		expect(stateAt(mark(), '2026-10-01T12:00:00Z')).toEqual({ kind: 'snoozed', snooze: {} });
		expect(stateAt(mark(), '2026-10-01T12:05:00Z')).toEqual({ kind: 'none' });
	});

	it('snoozes until a time, also through new activity', () => {
		const until = SNOOZED_AT + 3 * HOUR;
		const m = mark({ snoozedUntil: until });
		expect(stateAt(m, '2026-10-01T13:00:00Z')).toEqual({ kind: 'snoozed', snooze: { until } });
		expect(stateAt(m, '2026-10-01T12:00:00Z', facts(), until)).toEqual({ kind: 'none' });
	});

	it('snoozes until something happens, or until the deadline', () => {
		const m = mark({ snoozeEvent: 'ci_pass', snoozedUntil: eventSnoozeDeadline(SNOOZED_AT) });
		expect(stateAt(m, '2026-10-01T12:00:00Z')).toEqual({
			kind: 'snoozed',
			snooze: { event: 'ci_pass' }
		});
		expect(stateAt(m, '2026-10-01T12:00:00Z', facts({ ci: 'SUCCESS' }))).toEqual({ kind: 'none' });
		expect(stateAt(m, '2026-10-01T12:00:00Z', facts({ state: 'merged' }))).toEqual({
			kind: 'none'
		});
		expect(stateAt(m, '2026-10-01T12:00:00Z', facts(), eventSnoozeDeadline(SNOOZED_AT))).toEqual({
			kind: 'none'
		});
	});

	it('does not wake for your own reply', () => {
		const m = mark({ snoozeEvent: 'reply', snoozedUntil: eventSnoozeDeadline(SNOOZED_AT) });
		const reply = (author: string) =>
			facts({
				lastComment: {
					author,
					authorIsBot: false,
					body: 'ok',
					url: 'https://github.com/acme/web/pull/7#c',
					createdAt: '2026-10-01T12:30:00Z'
				}
			});
		expect(stateAt(m, '2026-10-01T12:30:00Z', reply(ME)).kind).toBe('snoozed');
		expect(stateAt(m, '2026-10-01T12:30:00Z', reply('bob')).kind).toBe('none');
	});

	it('mutes until you unmute it', () => {
		expect(stateAt(mark({ updatedAt: MUTED_AT }), '2027-01-01T00:00:00Z')).toEqual({
			kind: 'muted'
		});
	});

	it('says until when an item sleeps', () => {
		expect(snoozeLabel({})).toBe('Until new activity');
		expect(snoozeLabel({ event: 'ci_pass' })).toBe('Until CI passes');
		expect(snoozeLabel({ event: 'approved' })).toBe('Until someone approves');
		expect(snoozeLabel({ until: SNOOZED_AT })).toMatch(/^Until /);
	});
});

describe('unread items', () => {
	it('are new to you, or changed since you looked, not counting labels', () => {
		expect(isUnread(null, [])).toBe(true);
		expect(isUnread(SNOOZED_AT, [])).toBe(false);
		expect(isUnread(SNOOZED_AT, [{ kind: 'comments', text: '1 new comment', tone: null }])).toBe(
			true
		);
		expect(
			isUnread(SNOOZED_AT, [{ kind: 'labels', text: 'bug', tone: null, labels: ['bug'] }])
		).toBe(false);
	});
});
