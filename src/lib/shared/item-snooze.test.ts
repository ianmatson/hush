import { describe, expect, it } from 'vitest';
import { isUnread, snoozeLabel } from './item-snooze';

const SNOOZED_AT = Date.parse('2026-10-01T12:00:00Z');

describe('item snoozes', () => {
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
