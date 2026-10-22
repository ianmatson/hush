import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashItem } from '$lib/shared/types';
import type { ItemsResponse } from '$lib/model/present';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('svelte-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('$lib/api', () => ({
	ApiError: class extends Error {},
	api: {
		snoozeItems: vi.fn(),
		muteItems: vi.fn(),
		unsnoozeItems: vi.fn(),
		seen: vi.fn(),
		unseen: vi.fn(),
		pinItems: vi.fn(),
		recheck: vi.fn()
	}
}));

const { api } = await import('$lib/api');
const { keys, queryClient } = await import('./queries');
const { setItemsRead, snoozeItems, toggleMuteItems } = await import('./item-actions');
const { refreshItemDetails } = await import('./recheck');

const failing = () => Promise.reject(new Error('GitHub is down'));

const item = (id: string, extra: Partial<DashItem> = {}) =>
	({
		id,
		itemId: `node-${id}`,
		revision: 1,
		views: ['mine'],
		retainedIn: [],
		kind: 'pr',
		updatedAt: '2026-10-01T00:00:00Z',
		unread: true,
		dismissed: false,
		muted: false,
		...extra
	}) as DashItem;

const cachedItem = (id: string) =>
	queryClient.getQueryData<ItemsResponse>(keys.items)?.rows.find((i) => i.id === id);

describe('optimistic item actions', () => {
	beforeEach(() => {
		queryClient.clear();
		queryClient.setQueryData(keys.items, {
			rows: [item('a'), item('b')]
		} as unknown as ItemsResponse);
	});

	it('restores a snoozed item when the server refuses', async () => {
		vi.mocked(api.snoozeItems).mockImplementation(failing);
		await snoozeItems(['a'], {});
		expect(cachedItem('a')).toEqual(item('a'));
	});

	it('restores a muted item when the server refuses', async () => {
		vi.mocked(api.muteItems).mockImplementation(failing);
		await toggleMuteItems(['a']);
		expect(cachedItem('a')).toMatchObject({ dismissed: false, muted: false });
	});

	it('restores unread state when marking read fails', async () => {
		vi.mocked(api.seen).mockImplementation(failing);
		await setItemsRead(['a'], true);
		expect(cachedItem('a')).toMatchObject({ unread: true });
	});

	it('leaves other items alone when one action fails', async () => {
		vi.mocked(api.snoozeItems).mockImplementation(failing);
		const snoozing = snoozeItems(['a'], {});
		await Promise.resolve();
		queryClient.setQueryData<ItemsResponse>(keys.items, (old) =>
			old ? { ...old, rows: old.rows.map((x) => (x.id === 'b' ? { ...x, muted: true } : x)) } : old
		);
		await snoozing;
		expect(cachedItem('b')).toMatchObject({ muted: true });
	});

	it('keeps a later read when an earlier snooze fails', async () => {
		let rejectSnooze: (err: Error) => void = () => {};
		vi.mocked(api.snoozeItems).mockClear();
		vi.mocked(api.snoozeItems).mockImplementation(
			() => new Promise((_, reject) => (rejectSnooze = reject))
		);
		vi.mocked(api.seen).mockResolvedValue(undefined as never);
		const snoozing = snoozeItems(['a'], {});
		await vi.waitFor(() => expect(api.snoozeItems).toHaveBeenCalled());
		await setItemsRead(['a'], true);
		rejectSnooze(new Error('GitHub is down'));
		await snoozing;
		expect(cachedItem('a')).toMatchObject({ unread: false, dismissed: false });
	});

	it('keeps the change when the server accepts it', async () => {
		vi.mocked(api.snoozeItems).mockResolvedValue(undefined as never);
		await snoozeItems(['a'], {});
		expect(cachedItem('a')).toMatchObject({ dismissed: true });
	});
});

describe('refreshItemDetails', () => {
	it('marks the item details stale after a recheck', async () => {
		queryClient.clear();
		const details = [
			keys.peek('acme/web', 7),
			keys.reviewThreads('acme/web', 7),
			keys.pullViewed('acme/web', 7),
			keys.pullFiles('acme/web', 7, 'abc123')
		];
		for (const queryKey of details) queryClient.setQueryData(queryKey, {});
		queryClient.setQueryData(keys.peek('acme/web', 8), {});
		await refreshItemDetails('acme/web', 7);
		for (const queryKey of details)
			expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(keys.peek('acme/web', 8))?.isInvalidated).toBe(false);
	});
});
