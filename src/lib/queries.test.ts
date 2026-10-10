import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/api', () => ({ api: {}, ApiError: class extends Error {} }));

const { keys, queryClient, refetchUnlessLive } = await import('./queries');
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
