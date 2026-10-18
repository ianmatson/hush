import { describe, expect, it } from 'vitest';
import type { Env } from '../db';
import { renderFeed } from '../feeds';

describe('feed links', () => {
	it('point at the app address, not the address the request came to', async () => {
		const env = {
			APP_URL: 'https://app.test',
			DB: {
				prepare: () => ({ bind: () => ({ first: async () => ({ user_id: 1, view: 'mine' }) }) })
			},
			POLLER: {
				idFromName: () => 'poller',
				get: () => ({ feedEntries: async () => ({ name: 'Mine', entries: [] }) })
			}
		} as unknown as Env;
		const xml = await (await renderFeed(env, 'secret')).text();
		expect(xml).toContain('<link rel="self" href="https://app.test/feeds/secret"/>');
		expect(xml).toContain('<link href="https://app.test/"/>');
	});
});
