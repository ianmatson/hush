import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
vi.mock('../poller/base', () => ({ PollerBase: class {} }));
vi.mock('../slack-store', () => ({ slackConnection: vi.fn() }));
vi.mock('../webpush', () => ({ sendPush: vi.fn(), vapidFromEnv: vi.fn(() => ({})) }));
vi.mock('../poller/data', async () => ({
	PollerData: (await import('../poller/alerts')).PollerAlerts
}));

const { PollerAlerts } = await import('../poller/alerts');
const { ActivePoller } = await import('../poller');
type PushCandidate = import('../poller/alerts').PushCandidate;
const { slackConnection } = await import('../slack-store');
const { sendPush } = await import('../webpush');

class TestPoller extends ActivePoller {
	send(candidates: PushCandidate[]) {
		return this.deliver(candidates);
	}
}

class TestAlerts extends PollerAlerts {
	flush() {
		return this.flushHeld();
	}
	send(candidates: PushCandidate[]) {
		return this.deliver(candidates);
	}
}

const held = {
	count: 2,
	messages: [
		{
			title: 'Review requested',
			body: 'Fix\no/r',
			url: 'https://github.com/o/r/pull/1',
			tag: 'o/r#1'
		},
		{ title: 'CI failed', body: 'Add\no/r', url: 'https://github.com/o/r/pull/2', tag: 'o/r#2' }
	],
	duringQuiet: false
};

const ONE_PER_FOUR_HOURS = { count: 1, minutes: 240 };

function harness(pushLimit: typeof DEFAULT_SETTINGS.pushLimit = null) {
	const values = new Map<string, unknown>([
		['userId', 1],
		['held', structuredClone(held)]
	]);
	const poller = Object.assign(Object.create(TestAlerts.prototype) as TestAlerts, {
		env: {
			APP_URL: 'https://app.test',
			SLACK_CLIENT_ID: 'id',
			SLACK_CLIENT_SECRET: 'secret',
			VAPID_PRIVATE_KEY: 'key'
		},
		ctx: {
			storage: {
				get: async (key: string | string[]) =>
					Array.isArray(key)
						? new Map(
								key.flatMap((k) => (values.has(k) ? [[k, structuredClone(values.get(k))]] : []))
							)
						: structuredClone(values.get(key)),
				put: async (key: string | Record<string, unknown>, value?: unknown) => {
					const entries = typeof key === 'string' ? [[key, value] as const] : Object.entries(key);
					for (const [k, v] of entries) values.set(k, structuredClone(v));
				},
				delete: async (keys: string | string[]) => {
					for (const k of [keys].flat()) values.delete(k);
				}
			}
		},
		settings: async () => ({ ...structuredClone(DEFAULT_SETTINGS), pushLimit }),
		appInFocus: () => false,
		one: () => ({ n: 1 }),
		all: () => [{ endpoint: 'https://push.test/1', p256dh: 'key', auth: 'auth' }],
		allIn: () => [],
		run: () => 0,
		runIn: () => 0,
		putChanged: async (changes: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(changes)) values.set(k, v);
		}
	});
	return { poller, values };
}

describe('held alerts', () => {
	beforeEach(() => vi.clearAllMocks());

	it('keeps the held alerts when the send path throws', async () => {
		const { poller, values } = harness();
		vi.mocked(slackConnection).mockRejectedValue(new Error('D1 is down'));
		await expect(poller.flush()).rejects.toThrow('D1 is down');
		expect(values.get('held')).toEqual(held);
	});

	it('keeps the held alerts when no channel takes them', async () => {
		const { poller, values } = harness();
		vi.mocked(slackConnection).mockResolvedValue(null);
		vi.mocked(sendPush).mockResolvedValue(500);
		await poller.flush();
		expect(values.get('held')).toEqual(held);
	});

	it('forgets the held alerts once a channel takes them', async () => {
		const { poller, values } = harness();
		vi.mocked(slackConnection).mockResolvedValue(null);
		vi.mocked(sendPush).mockResolvedValue(201);
		await poller.flush();
		expect(values.has('held')).toBe(false);
		expect(vi.mocked(sendPush).mock.calls[0][1]).toMatchObject({
			title: '2 alerts',
			url: 'https://app.test/'
		});
	});

	it('keeps an alert that no channel took, to send again on the next cycle', async () => {
		const { poller, values } = harness();
		Object.assign(poller, {
			appSeenAt: async () => 0,
			transaction: (action: () => void) => action(),
			broadcast: () => {}
		});
		values.delete('held');
		vi.mocked(slackConnection).mockResolvedValue(null);
		vi.mocked(sendPush).mockResolvedValue(500);
		await poller.send([
			{ itemKey: 'o/r#1', reason: 'review_requested', message: held.messages[0] }
		]);
		expect(values.get('held')).toMatchObject({ count: 1, messages: [held.messages[0]] });
		expect(values.get('recentSends')).toBeUndefined();
		vi.mocked(sendPush).mockResolvedValue(201);
		await poller.flush();
		expect(values.has('held')).toBe(false);
		expect(vi.mocked(sendPush).mock.lastCall?.[1]).toMatchObject({ title: 'Review requested' });
	});

	it('records held-send capacity only after a channel takes the alert', async () => {
		const { poller, values } = harness(ONE_PER_FOUR_HOURS);
		vi.mocked(slackConnection).mockResolvedValue(null);
		vi.mocked(sendPush).mockResolvedValue(500);
		await poller.flush();
		expect(values.get('recentSends')).toBeUndefined();
		vi.mocked(sendPush).mockResolvedValue(201);
		await poller.flush();
		expect(values.get('recentSends')).toHaveLength(1);
	});
});

describe('a failed immediate alert in a poll cycle', () => {
	beforeEach(() => vi.clearAllMocks());

	function cyclingPoller(pollDeliveries: PushCandidate[][]) {
		const { values, poller: alerts } = harness(ONE_PER_FOUR_HOURS);
		values.delete('held');
		const poller = Object.assign(Object.create(TestPoller.prototype) as TestPoller, alerts, {
			appSeenAt: async () => 0,
			transaction: (action: () => void) => action(),
			broadcast: () => {},
			ctx: { ...alerts.ctx, getWebSockets: () => [] },
			fillDecisions: async () => {},
			schedule: async () => {},
			poll: () => poller.send(pollDeliveries.shift() ?? [])
		});
		return { poller, values };
	}

	it('stays held for the next cycle and keeps the send limit free', async () => {
		vi.mocked(slackConnection).mockResolvedValue(null);
		vi.mocked(sendPush).mockResolvedValue(500);
		const { poller, values } = cyclingPoller([
			[{ itemKey: 'o/r#1', reason: 'review_requested', message: held.messages[0] }]
		]);
		await poller.alarm();
		expect(sendPush).toHaveBeenCalledTimes(1);
		expect(values.get('held')).toMatchObject({ count: 1 });
		expect(values.get('recentSends')).toBeUndefined();
		vi.mocked(sendPush).mockResolvedValue(201);
		await poller.alarm();
		expect(sendPush).toHaveBeenCalledTimes(2);
		expect(values.has('held')).toBe(false);
		expect(values.get('recentSends')).toHaveLength(1);
	});
});
