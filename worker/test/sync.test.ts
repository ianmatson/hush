import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { SubjectFacts } from '../../src/lib/shared/subject';
import type { Who } from '../poller/shared';
import type { GhNotification } from '../github';

vi.mock('../poller/subjects', () => ({ PollerSubjects: class {} }));
vi.mock('../poller/data', async () => ({
	PollerData: (await import('../poller/sync')).PollerSync
}));
vi.mock('../github', async (importOriginal) => ({
	...(await importOriginal<typeof import('../github')>()),
	fetchSubjects: vi.fn(),
	listNotifications: vi.fn()
}));

const { PollerSync } = await import('../poller/sync');
const { fetchSubjects } = await import('../github');
const { listNotifications } = await import('../github');
const { Poller } = await import('../poller');
const who: Who = {
	userId: 1,
	me: 'ian',
	token: 'test',
	settings: DEFAULT_SETTINGS,
	projectAccess: 'read'
};
const notification = (id: string, number: number): GhNotification => ({
	id,
	unread: true,
	reason: 'mention',
	updated_at: '2026-10-14T12:00:00Z',
	last_read_at: null,
	subject: {
		title: 'Fix',
		url: `https://api.github.com/repos/o/r/pulls/${number}`,
		latest_comment_url: null,
		type: 'PullRequest'
	},
	repository: {
		full_name: 'o/r',
		html_url: 'https://github.com/o/r',
		name: 'r',
		owner: { login: 'o' }
	}
});
const subject = { id: 'PR_1', repo: 'o/r', number: 1, kind: 'pr' } as SubjectFacts;

class TestSync extends PollerSync {
	protected async rebuildTracked() {}
	sync(items: GhNotification[], initialized = true) {
		return this.ingest(who, items, initialized);
	}
}

function harness() {
	const remembered = new Map<string, string>();
	const values = new Map<string, unknown>();
	const record = vi.fn(async () => ({ changed: 0 }));
	const poller = Object.assign(Object.create(TestSync.prototype) as TestSync, {
		ctx: {
			storage: {
				get: vi.fn(async (key: string) => structuredClone(values.get(key))),
				put: vi.fn(async (key: string, value: unknown) => {
					values.set(key, structuredClone(value));
				})
			}
		},
		all: vi.fn((_sql: string, ...ids: string[]) =>
			ids.flatMap((id) => (remembered.has(id) ? [{ id, updated_at: remembered.get(id) }] : []))
		),
		trackedItemKeys: vi.fn((keys: string[]) => new Set(keys)),
		record,
		run: vi.fn((_sql: string, id: string, updatedAt: string) => remembered.set(id, updatedAt)),
		transaction: vi.fn((action: () => void) => action())
	});
	return { poller, remembered, record, values };
}

describe('notification acknowledgement', () => {
	beforeEach(() => vi.clearAllMocks());

	it('stores only the fields needed to retry a notification', async () => {
		const { poller, values } = harness();
		const raw = {
			...notification('n1', 1),
			repository: { ...notification('n1', 1).repository, description: 'x'.repeat(5000) }
		};
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map());
		await poller.sync([raw]);
		const pending = values.get('pendingNotifications');
		expect(JSON.stringify(pending)).not.toContain('description');
		expect(JSON.stringify(pending)).not.toContain('latest_comment_url');
		expect(JSON.stringify(pending).length).toBeLessThan(500);
	});

	it('retries a failed subject read instead of treating the notification as handled', async () => {
		const { poller, remembered, record } = harness();
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map());
		await poller.sync([notification('n1', 1)]);
		expect(remembered.size).toBe(0);
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n1', subject]]));
		await poller.sync([]);
		expect(record).toHaveBeenLastCalledWith(
			who,
			[subject],
			expect.objectContaining({
				mentions: new Map([['o/r#1', { fact: 'mentioned', title: 'You were mentioned' }]])
			})
		);
		expect(remembered.has('n1')).toBe(true);
	});

	it('acknowledges successful items and retries only the failed items of a batch', async () => {
		const { poller, remembered } = harness();
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n1', subject]]));
		await poller.sync([notification('n1', 1), notification('n2', 2)]);
		expect([...remembered.keys()]).toEqual(['n1']);
		vi.mocked(fetchSubjects).mockResolvedValueOnce(
			new Map([['n2', { ...subject, id: 'PR_2', number: 2 }]])
		);
		await poller.sync([notification('n1', 1), notification('n2', 2)]);
		expect(vi.mocked(fetchSubjects).mock.calls[1][1].map((ref) => ref.key)).toEqual(['n2']);
	});

	it('does not acknowledge a notification if recording its facts fails', async () => {
		const { poller, remembered, record } = harness();
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n1', subject]]));
		record.mockRejectedValueOnce(new Error('Storage failed'));
		await expect(poller.sync([notification('n1', 1)])).rejects.toThrow('Storage failed');
		expect(remembered.size).toBe(0);
	});

	it('stops retrying a permanently unavailable item after three polls without blocking other items', async () => {
		const { poller, remembered } = harness();
		vi.mocked(fetchSubjects).mockResolvedValue(new Map());
		await poller.sync([notification('n1', 1)]);
		await poller.sync([]);
		await poller.sync([]);
		expect(remembered.has('n1')).toBe(true);
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n2', { ...subject, number: 2 }]]));
		await poller.sync([notification('n1', 1), notification('n2', 2)]);
		expect(vi.mocked(fetchSubjects).mock.calls[3][1].map((ref) => ref.key)).toEqual(['n2']);
	});

	it('does not retry definitive item deletion or lost access', async () => {
		const { poller, remembered } = harness();
		vi.mocked(fetchSubjects).mockImplementationOnce(async (_token, _refs, _me, unavailable) => {
			unavailable!.add('n1');
			return new Map();
		});
		await poller.sync([notification('n1', 1)]);
		await poller.sync([]);
		expect(remembered.has('n1')).toBe(true);
		expect(fetchSubjects).toHaveBeenCalledTimes(1);
	});

	it('keeps untracked notifications pending until a later poll tracks their item', async () => {
		const { poller, remembered, record } = harness();
		Object.assign(poller, { trackedItemKeys: () => new Set() });
		await poller.sync([notification('n1', 1)]);
		expect(remembered.has('n1')).toBe(false);
		expect(record).not.toHaveBeenCalled();
		Object.assign(poller, { trackedItemKeys: (keys: string[]) => new Set(keys) });
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n1', subject]]));
		await poller.sync([]);
		expect(remembered.has('n1')).toBe(true);
		expect(record).toHaveBeenCalledWith(who, [subject], expect.objectContaining({ quiet: false }));
	});

	it('keeps baseline notification retries quiet after initialization completes', async () => {
		const { poller, record } = harness();
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map());
		await poller.sync([notification('n1', 1)], false);
		vi.mocked(fetchSubjects).mockResolvedValueOnce(new Map([['n1', subject]]));
		await poller.sync([], true);
		expect(record).toHaveBeenLastCalledWith(who, [subject], { quiet: true, mentions: new Map() });
	});

	it('advances polling and runs rebuilds and cleanup while retrying an unreadable item across 304 responses', async () => {
		const { poller: original, remembered, values } = harness();
		const poller = Object.assign(Object.create(Poller.prototype) as Poller, original);
		const keepTrackedFresh = vi.fn(async () => {});
		const cleanup = vi.fn(async () => {});
		let alarm: number | null = null;
		const ctx = (original as unknown as { ctx: { storage: object } }).ctx;
		Object.assign(ctx, { getWebSockets: () => [] });
		Object.assign(ctx.storage, {
			get: async (key: string | string[]) =>
				Array.isArray(key)
					? new Map(key.map((name) => [name, values.get(name)]))
					: structuredClone(values.get(key)),
			put: async (key: string | Record<string, unknown>, value: unknown) => {
				if (typeof key === 'string') values.set(key, structuredClone(value));
				else
					for (const [name, entry] of Object.entries(key)) values.set(name, structuredClone(entry));
			},
			setAlarm: async (at: number) => {
				alarm = at;
			},
			getAlarm: async () => alarm
		});
		Object.assign(poller, {
			ctx,
			account: async () => ({ id: 1 }),
			who: async () => who,
			broadcast: vi.fn(),
			putChanged: async (changes: Record<string, unknown>) => {
				for (const [key, value] of Object.entries(changes)) values.set(key, value);
			},
			keepTrackedFresh,
			cleanup,
			fillDecisions: async () => {},
			flushHeld: async () => {}
		});
		values.set('userId', 1);
		values.set('lastActive', Date.now());
		values.set('initialized', true);
		vi.mocked(fetchSubjects).mockResolvedValue(new Map());
		const page = {
			status: 200,
			items: [notification('n1', 1)],
			lastModified: 'snapshot',
			pollInterval: 60,
			ssoHiddenOrgs: [],
			complete: true
		};
		vi.mocked(listNotifications)
			.mockResolvedValueOnce(page)
			.mockResolvedValue({ ...page, status: 304, items: [] });
		await poller.alarm();
		await poller.alarm();
		await poller.alarm();
		expect(values.get('lastModified')).toBe('snapshot');
		expect(values.get('errorCount')).toBe(0);
		expect(remembered.has('n1')).toBe(true);
		expect(keepTrackedFresh).toHaveBeenCalledTimes(3);
		expect(cleanup).toHaveBeenCalledTimes(3);
		expect(alarm! - Date.now()).toBeLessThanOrEqual(5 * 60_000);
	});
});
