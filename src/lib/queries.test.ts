import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/api', () => ({ api: {}, ApiError: class extends Error {} }));

const { keys, persistOptions, queryClient, refetchUnlessLive, suggestQuery } =
	await import('./queries');
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
