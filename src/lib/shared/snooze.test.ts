import { describe, expect, it } from 'vitest';
import { eventHappened, eventsFor, snoozeOutcome } from './snooze';
import type { Enrichment } from './types';

const since = Date.parse('2026-09-20T12:00:00Z');
const pr = (e: Partial<Enrichment> = {}): Enrichment => ({ kind: 'pr', state: 'open', ...e });
const before = '2026-09-20T11:00:00Z';
const later = '2026-09-20T13:00:00Z';

describe('eventHappened', () => {
	it('CI passes / finishes', () => {
		expect(eventHappened('ci_pass', pr({ ci: 'SUCCESS' }), since, 'ian')).toBe(true);
		expect(eventHappened('ci_pass', pr({ ci: 'FAILURE' }), since, 'ian')).toBe(false);
		expect(eventHappened('ci_done', pr({ ci: 'FAILURE' }), since, 'ian')).toBe(true);
		expect(eventHappened('ci_done', pr({ ci: 'PENDING' }), since, 'ian')).toBe(false);
	});
	it('a reply counts only when it is newer, human, and not mine', () => {
		const c = (author: string, createdAt: string, authorIsBot = false) =>
			pr({ lastComment: { author, createdAt, authorIsBot, body: '', url: '' } });
		expect(eventHappened('reply', c('bob', later), since, 'ian')).toBe(true);
		expect(eventHappened('reply', c('bob', before), since, 'ian')).toBe(false);
		expect(eventHappened('reply', c('ian', later), since, 'ian')).toBe(false);
		expect(eventHappened('reply', c('ci[bot]', later, true), since, 'ian')).toBe(false);
		expect(
			eventHappened(
				'reply',
				pr({ latestReview: { author: 'bob', at: later, state: 'COMMENTED' } }),
				since,
				'ian'
			)
		).toBe(true);
	});
	it('new commits and new reviews compare with the snooze time', () => {
		expect(eventHappened('commits', pr({ lastCommitAt: later }), since, 'ian')).toBe(true);
		expect(eventHappened('commits', pr({ lastCommitAt: before }), since, 'ian')).toBe(false);
		expect(
			eventHappened(
				'review',
				pr({ latestReview: { author: 'ian', at: later, state: 'APPROVED' } }),
				since,
				'ian'
			)
		).toBe(false);
	});
	it('approved and closed read the current state', () => {
		expect(eventHappened('approved', pr({ reviewDecision: 'APPROVED' }), since, 'ian')).toBe(true);
		expect(eventHappened('closed', pr({ state: 'merged' }), since, 'ian')).toBe(true);
		expect(eventHappened('closed', null, since, 'ian')).toBe(false);
	});
});

describe('eventsFor', () => {
	it('offers only events valid for all selected subjects', () => {
		expect(eventsFor(['pr']).map((e) => e.id)).toContain('ci_pass');
		expect(eventsFor(['pr', 'issue']).map((e) => e.id)).toEqual(['reply', 'closed']);
		expect(eventsFor(['other'])).toEqual([]);
	});
});

describe('snoozeOutcome', () => {
	it('wakes on the event', () => {
		expect(snoozeOutcome('ci_pass', pr({ ci: 'SUCCESS' }), since, 'ian')).toEqual({ wake: true, reason: 'CI passed' });
	});
	it('wakes when the PR is merged or closed, whatever the condition', () => {
		expect(snoozeOutcome('ci_pass', pr({ state: 'merged', ci: 'FAILURE' }), since, 'ian')).toEqual({ wake: true, reason: 'Merged' });
		expect(snoozeOutcome('reply', { kind: 'issue', state: 'closed' }, since, 'ian')).toEqual({ wake: true, reason: 'Closed' });
	});
	it('keeps waiting otherwise, and when the PR cannot be read', () => {
		expect(snoozeOutcome('ci_pass', pr({ ci: 'PENDING' }), since, 'ian')).toEqual({ wake: false });
		expect(snoozeOutcome('reply', null, since, 'ian')).toEqual({ wake: false });
	});
});
