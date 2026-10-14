import { describe, expect, it, vi } from 'vitest';
import type { DashResponse } from '../../src/lib/shared/types';

vi.mock('../poller/dashboard', () => ({ PollerDashboard: class {} }));
vi.mock('../poller/decisions', () => ({ DECISION_FILL_KEY: 'decisionFill' }));
const { PollerData } = await import('../poller/data');

describe('public dashboard payload', () => {
	it('excludes server source metadata and project error bookkeeping', async () => {
		const data: DashResponse = {
			kind: 'pr',
			items: [],
			sourceItems: [],
			projectErrors: ['Project failed'],
			sections: [],
			teams: [],
			errors: ['Project failed'],
			fetchedAt: Date.now()
		};
		const poller = Object.assign(
			Object.create(PollerData.prototype) as InstanceType<typeof PollerData>,
			{
				dashboard: async () => data,
				account: async () => ({ login: 'reviewer' }),
				all: () => [],
				sinceYouLooked: () => new Map()
			}
		);
		const result = await poller.dashboardView('pr', false);
		expect(result).not.toHaveProperty('sourceItems');
		expect(result).not.toHaveProperty('projectErrors');
		expect(result.errors).toEqual(['Project failed']);
		expect(data.sourceItems).toEqual([]);
	});
});
