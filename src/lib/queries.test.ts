import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeekDTO } from '$lib/shared/types';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/api', () => ({ api: {}, ApiError: class extends Error {} }));

const { keys, peekQuery, persistOptions, queryClient, refetchUnlessLive, suggestQuery } =
	await import('./queries');
const { api } = (await import('$lib/api')) as unknown as {
	api: { peek: (repo: string, number: number) => Promise<PeekDTO> };
};
const { live } = await import('./live-state.svelte');

describe('refetchUnlessLive', () => {
	beforeEach(() => {
		queryClient.clear();
		queryClient.setQueryData(keys.alerts, []);
	});

	it('leaves the cache alone while the live socket is connected', async () => {
		live.connected = true;
		await refetchUnlessLive(keys.alerts);
		expect(queryClient.getQueryState(keys.alerts)?.isInvalidated).toBe(false);
	});

	it('invalidates the given queries while the live socket is down', async () => {
		live.connected = false;
		await refetchUnlessLive(keys.alerts);
		expect(queryClient.getQueryState(keys.alerts)?.isInvalidated).toBe(true);
	});
});

describe('suggestQuery', () => {
	it('keeps answers for different source repos apart', () => {
		const fromWeb = suggestQuery('acme/api', 'ref', '12', 'acme/web').queryKey;
		const fromApi = suggestQuery('acme/api', 'ref', '12', 'acme/api').queryKey;
		expect(fromWeb).not.toEqual(fromApi);
	});
});

describe('persisted cache', () => {
	const persisted = (queryKey: readonly unknown[]) =>
		persistOptions.dehydrateOptions.shouldDehydrateQuery({
			state: { status: 'success' },
			queryKey
		});

	it('keeps the answers to each typed word in memory only', () => {
		expect(persisted(keys.suggest('acme/web', 'user', 'oct', 'acme/web'))).toBe(false);
		expect(persisted(keys.searchCount('repo:acme/web is:open'))).toBe(false);
	});

	it('saves the lists that a reload shows at once', () => {
		expect(persisted(keys.items)).toBe(true);
		expect(persisted(keys.alerts)).toBe(true);
	});
});

describe('peekQuery', () => {
	const entry = (id: string) => ({
		type: 'comment' as const,
		id,
		author: { login: 'bob', avatar: null, bot: false },
		at: '2026-10-22T00:00:00Z',
		url: `u#${id}`,
		html: id
	});
	const peek = (ids: string[], before: string | null) =>
		({
			repo: 'acme/web',
			number: 1,
			timeline: { total: 4, items: ids.map(entry), before }
		}) as PeekDTO;

	it('keeps an older page that loaded while the refetch was running', async () => {
		const key = keys.peek('acme/web', 1);
		queryClient.setQueryData(key, peek(['c', 'd'], 'at-c'));
		let answer: (p: PeekDTO) => void = () => {};
		api.peek = () => new Promise((resolve) => (answer = resolve));
		const refetch = queryClient.fetchQuery({ ...peekQuery('acme/web', 1), staleTime: 0 });
		queryClient.setQueryData(key, peek(['a', 'b', 'c', 'd'], null));
		answer(peek(['c', 'd'], 'at-c'));
		const merged = await refetch;
		expect(merged.timeline.items.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(merged.timeline.before).toBeNull();
	});
});
