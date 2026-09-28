import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/api', () => ({ api: {}, ApiError: class extends Error {} }));

const { keys, queryClient, setCounts } = await import('./queries');

describe('setCounts', () => {
	beforeEach(() => queryClient.clear());

	it('copies the fresh counts into every cached list', () => {
		queryClient.setQueryData(keys.items('updates'), {
			items: [],
			finished: [],
			counts: { turn: 0, waiting: 0, updates: 0 }
		});
		setCounts({ turn: 6, waiting: 2, updates: 1 });
		expect(queryClient.getQueryData<{ counts: unknown }>(keys.items('updates'))?.counts).toEqual({
			turn: 6,
			waiting: 2,
			updates: 1
		});
	});
});
