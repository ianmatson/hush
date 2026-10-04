import type { Settings } from '../../src/lib/shared/types';
import { routes, poller, json } from '../app';

// --- Settings (checked and saved in the user's Durable Object: poller/data.ts) ---------------

const app = routes()
	.put('/api/settings', json<Partial<Settings>>(), async (c) => {
		const r = await poller(c.env, c.get('user').id).updateSettings(c.req.valid('json'));
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	})
	/** All your changes at once (settings.json, an imported file): the rest goes to defaults. */
	.put('/api/settings/all', json<Partial<Settings>>(), async (c) => {
		const r = await poller(c.env, c.get('user').id).updateSettings(c.req.valid('json'), true);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	});

export default app;
