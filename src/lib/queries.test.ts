import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/api', () => ({ api: {}, ApiError: class extends Error {} }));

const { keys, queryClient, reconcileViews } = await import('./queries');

const list = (n: number) => ({
	threads: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
	counts: { action: n, fyi: 0, snoozed: 0 }
});

describe('reconcileViews', () => {
	beforeEach(() => queryClient.clear());

	it('refetches only cached lists whose length disagrees with the fresh counts', () => {
		queryClient.setQueryData(keys.threads('action'), list(0)); // stale: server now says 6
		queryClient.setQueryData(keys.threads('fyi'), {
			...list(2),
			counts: { action: 0, fyi: 2, snoozed: 0 }
		});
		reconcileViews('muted', { action: 6, fyi: 2, snoozed: 0 });

		expect(queryClient.getQueryState(keys.threads('action'))?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(keys.threads('fyi'))?.isInvalidated).toBe(false);
	});

	it('copies the fresh counts into every cached view', () => {
		queryClient.setQueryData(keys.threads('fyi'), list(0));
		reconcileViews('muted', { action: 6, fyi: 0, snoozed: 1 });
		expect(queryClient.getQueryData<{ counts: unknown }>(keys.threads('fyi'))?.counts).toEqual({
			action: 6,
			fyi: 0,
			snoozed: 1
		});
	});
});
