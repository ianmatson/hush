import { describe, expect, it } from 'vitest';
import {
	digestWindowIsOver,
	heldAreDue,
	holdReason,
	keptSends,
	limitRoom,
	mayBuzzAgain,
	validateClearNotifications,
	validateDigestMinutes,
	validatePushLimit,
	validatePushRepeat
} from './push-policy';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 7, 12, 0);
const pushedEarlier = { pushedAt: NOW - 10 * MIN, reason: 'review_requested' };
const noDelivery = { quietHours: null, pushDigestMinutes: null, pushLimit: null };
const noState = { recentSends: [], lastDigestAt: 0 };

describe('mayBuzzAgain', () => {
	it('lets an item buzz the first time in every mode', () => {
		for (const mode of ['once', 'reason', 'every'] as const)
			expect(mayBuzzAgain(mode, null, 'ci_failed', 0)).toBe(true);
	});
	it('"once": not again until Hush was open after the push', () => {
		expect(mayBuzzAgain('once', pushedEarlier, 'changes_requested', NOW - 20 * MIN)).toBe(false);
		expect(mayBuzzAgain('once', pushedEarlier, 'review_requested', NOW - MIN)).toBe(true);
	});
	it('"reason": also when the reason changes', () => {
		expect(mayBuzzAgain('reason', pushedEarlier, 'review_requested', 0)).toBe(false);
		expect(mayBuzzAgain('reason', pushedEarlier, 'changes_requested', 0)).toBe(true);
	});
	it('"every": always', () => {
		expect(mayBuzzAgain('every', pushedEarlier, 'review_requested', 0)).toBe(true);
	});
});

describe('holdReason and heldAreDue', () => {
	it('sends at once with no digest, limit, or quiet hours', () => {
		expect(holdReason(noDelivery, NOW, noState)).toBeNull();
		expect(heldAreDue(noDelivery, NOW, noState)).toBe(true);
	});
	it('holds everything in digest mode, and releases it each interval', () => {
		const digest = { ...noDelivery, pushDigestMinutes: 30 };
		expect(holdReason(digest, NOW, noState)).toBe('digest');
		expect(heldAreDue(digest, NOW, { recentSends: [], lastDigestAt: NOW - 20 * MIN })).toBe(false);
		expect(heldAreDue(digest, NOW, { recentSends: [], lastDigestAt: NOW - 30 * MIN })).toBe(true);
	});
	it('holds after the limit, until the window has room again', () => {
		const limited = { ...noDelivery, pushLimit: { count: 2, minutes: 30 } };
		const twoRecent = { recentSends: [NOW - 5 * MIN, NOW - MIN], lastDigestAt: 0 };
		const oneRecent = { recentSends: [NOW - 40 * MIN, NOW - MIN], lastDigestAt: 0 };
		expect(holdReason(limited, NOW, twoRecent)).toBe('limit');
		expect(holdReason(limited, NOW, oneRecent)).toBeNull();
		expect(heldAreDue(limited, NOW, twoRecent)).toBe(false);
		expect(heldAreDue(limited, NOW, oneRecent)).toBe(true);
	});
	it('holds in quiet hours before anything else', () => {
		const quiet = {
			...noDelivery,
			quietHours: { from: 0, to: 1439, weekends: false, timeZone: 'UTC' }
		};
		expect(holdReason(quiet, NOW, noState)).toBe('quiet');
		expect(heldAreDue(quiet, NOW, noState)).toBe(false);
	});
});

describe('limitRoom and digestWindowIsOver', () => {
	it('counts each push in the window against the limit', () => {
		const limited = { ...noDelivery, pushLimit: { count: 6, minutes: 30 } };
		const fourRecent = { recentSends: Array(4).fill(NOW - MIN), lastDigestAt: 0 };
		expect(limitRoom(limited, NOW, fourRecent)).toBe(2);
		expect(limitRoom(limited, NOW, { ...fourRecent, recentSends: Array(9).fill(NOW) })).toBe(0);
		expect(limitRoom(noDelivery, NOW, fourRecent)).toBe(Number.POSITIVE_INFINITY);
	});
	it('says when a digest interval is over', () => {
		const digest = { ...noDelivery, pushDigestMinutes: 30 };
		expect(digestWindowIsOver(digest, NOW, { recentSends: [], lastDigestAt: NOW - 31 * MIN })).toBe(
			true
		);
		expect(digestWindowIsOver(digest, NOW, { recentSends: [], lastDigestAt: NOW - MIN })).toBe(
			false
		);
		expect(digestWindowIsOver(noDelivery, NOW, noState)).toBe(false);
	});
});

describe('keptSends', () => {
	it('keeps only the sends inside the limit window, and none without a limit', () => {
		const sends = [NOW - 40 * MIN, NOW - 10 * MIN, NOW];
		expect(keptSends(sends, NOW, { count: 5, minutes: 30 })).toEqual([NOW - 10 * MIN, NOW]);
		expect(keptSends(sends, NOW, null)).toEqual([]);
	});
});

describe('validation', () => {
	it('accepts the documented values', () => {
		expect(validatePushRepeat('once')).toBeNull();
		expect(validateClearNotifications('item')).toBeNull();
		expect(validateDigestMinutes(null)).toBeNull();
		expect(validateDigestMinutes(60)).toBeNull();
		expect(validatePushLimit(null)).toBeNull();
		expect(validatePushLimit({ count: 6, minutes: 30 })).toBeNull();
	});
	it('refuses values out of range or of the wrong shape', () => {
		expect(validatePushRepeat('sometimes')).not.toBeNull();
		expect(validateClearNotifications(true)).not.toBeNull();
		expect(validateDigestMinutes(2)).not.toBeNull();
		expect(validateDigestMinutes(30.5)).not.toBeNull();
		expect(validatePushLimit({ count: 0, minutes: 30 })).not.toBeNull();
		expect(validatePushLimit({ count: 3, minutes: 30, burst: 1 })).not.toBeNull();
	});
});
