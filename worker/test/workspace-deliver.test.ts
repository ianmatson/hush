import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/lib/shared/durations';
import { NOW } from '../../src/lib/model/testing';
import { planDelivery, type DeliveryContext } from '../workspace/deliver';
import type { StoredAlert } from '../workspace/store';

const alert = (n: number, reasons: StoredAlert['reasons'] = ['review-requested']): StoredAlert => ({
	id: `PR_${n}@${n}:${reasons.join('+')}`,
	itemId: `PR_${n}`,
	reasons,
	title: `Alert ${n}`,
	body: `Change ${n}\nPostHog/posthog`,
	url: `https://github.com/PostHog/posthog/pull/${n}`,
	createdAt: NOW,
	delivery: { status: 'pending' }
});

function context(
	over: Partial<DeliveryContext> & { settings?: Partial<DeliveryContext['settings']> } = {}
) {
	return {
		now: NOW,
		origin: 'https://app.hush-gh.com',
		hasChannel: true,
		appInFocus: false,
		appSeenAt: 0,
		state: { recentSends: [], lastDigestAt: 0 },
		lastPushOf: () => null,
		heldByAttention: () => false,
		urgent: () => false,
		...over,
		settings: {
			pushRepeat: 'once',
			pushWhileOpen: false,
			pushUrgentNow: false,
			smartDecisions: true,
			quietHours: null,
			pushDigestMinutes: null,
			pushLimit: null,
			...over.settings
		}
	} satisfies DeliveryContext;
}

const sentIds = (plan: ReturnType<typeof planDelivery>) => plan.send.flatMap((s) => s.alertIds);

describe('planDelivery', () => {
	it('sends up to three alerts one by one, and more as one digest', () => {
		expect(planDelivery([alert(1), alert(2)], context()).send.map((s) => s.digest)).toEqual([
			false,
			false
		]);
		const many = planDelivery(
			[1, 2, 3, 4].map((n) => alert(n)),
			context()
		);
		expect(many.send).toHaveLength(1);
		expect(many.send[0].message.title).toBe('4 alerts');
	});

	it('skips alerts for muted or snoozed items, without a channel, or while Hush is open', () => {
		expect(planDelivery([alert(1)], context({ heldByAttention: () => true })).skip).toEqual([
			{ alertId: alert(1).id, reason: 'held' }
		]);
		expect(planDelivery([alert(1)], context({ hasChannel: false })).skip[0].reason).toBe(
			'no-channel'
		);
		expect(planDelivery([alert(1)], context({ appInFocus: true })).skip[0].reason).toBe('app-open');
		expect(
			planDelivery([alert(1)], context({ appInFocus: true, settings: { pushWhileOpen: true } }))
				.send
		).toHaveLength(1);
	});

	it('does not buzz again for an item until you open Hush, unless a snooze ended', () => {
		const pushed = { pushedAt: NOW - MINUTE_MS, reason: 'review-requested' };
		const ctx = context({ lastPushOf: () => pushed });
		expect(planDelivery([alert(1)], ctx).skip[0].reason).toBe('repeat');
		expect(sentIds(planDelivery([alert(1, ['snooze-over'])], ctx))).toEqual([
			alert(1, ['snooze-over']).id
		]);
		expect(sentIds(planDelivery([alert(1)], { ...ctx, appSeenAt: NOW }))).toEqual([alert(1).id]);
	});

	it('waits during quiet hours, but urgent alerts wait too', () => {
		const quiet = { quietHours: { from: 0, to: 24 * 60 - 1, weekends: true, timeZone: 'UTC' } };
		const plan = planDelivery([alert(1)], context({ settings: quiet, urgent: () => true }));
		expect(plan.send).toEqual([]);
		expect(plan.waitUntil).toBeGreaterThan(NOW);
	});

	it('sends urgent alerts at once during a digest window', () => {
		const settings = { pushDigestMinutes: 30, pushUrgentNow: true };
		const state = { recentSends: [], lastDigestAt: NOW - MINUTE_MS };
		const plan = planDelivery(
			[alert(1), alert(2)],
			context({ settings, state, urgent: (id) => id === 'PR_1' })
		);
		expect(sentIds(plan)).toEqual([alert(1).id]);
		expect(plan.waitUntil).toBe(NOW - MINUTE_MS + 30 * MINUTE_MS);
	});

	it('sends one digest when the digest window is over', () => {
		const settings = { pushDigestMinutes: 30 };
		const state = { recentSends: [], lastDigestAt: NOW - 31 * MINUTE_MS };
		const plan = planDelivery([alert(1), alert(2)], context({ settings, state }));
		expect(plan.send).toEqual([
			expect.objectContaining({ digest: true, alertIds: [alert(1).id, alert(2).id] })
		]);
	});

	it('waits for room under the send limit', () => {
		const settings = { pushLimit: { count: 1, minutes: 10 } };
		const state = { recentSends: [NOW - 2 * MINUTE_MS], lastDigestAt: 0 };
		const plan = planDelivery([alert(1)], context({ settings, state }));
		expect(plan.send).toEqual([]);
		expect(plan.waitUntil).toBe(NOW + 8 * MINUTE_MS);
	});

	it('sends again when the older sends leave the limit window', () => {
		const settings = { pushLimit: { count: 2, minutes: 30 } };
		const state = { recentSends: [NOW - 40 * MINUTE_MS, NOW - MINUTE_MS], lastDigestAt: 0 };
		expect(sentIds(planDelivery([alert(1)], context({ settings, state })))).toEqual([alert(1).id]);
	});

	it('holds digest alerts until the digest interval is over', () => {
		const settings = { pushDigestMinutes: 30 };
		const early = planDelivery(
			[alert(1)],
			context({ settings, state: { recentSends: [], lastDigestAt: NOW - 20 * MINUTE_MS } })
		);
		expect(early.send).toEqual([]);
		expect(early.waitUntil).toBe(NOW + 10 * MINUTE_MS);
		const due = planDelivery(
			[alert(1)],
			context({ settings, state: { recentSends: [], lastDigestAt: NOW - 30 * MINUTE_MS } })
		);
		expect(sentIds(due)).toEqual([alert(1).id]);
	});

	it('holds a due digest until the limit has room again', () => {
		const settings = { pushDigestMinutes: 5, pushLimit: { count: 1, minutes: 60 } };
		const lastDigestAt = NOW - 10 * MINUTE_MS;
		const full = planDelivery(
			[alert(1), alert(2)],
			context({ settings, state: { recentSends: [NOW - MINUTE_MS], lastDigestAt } })
		);
		expect(full.send).toEqual([]);
		expect(full.waitUntil).toBe(NOW - MINUTE_MS + 60 * MINUTE_MS);
		const room = planDelivery(
			[alert(1), alert(2)],
			context({ settings, state: { recentSends: [NOW - 61 * MINUTE_MS], lastDigestAt } })
		);
		expect(room.send).toEqual([
			expect.objectContaining({ digest: true, alertIds: [alert(1).id, alert(2).id] })
		]);
	});
});
