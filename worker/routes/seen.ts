import { routes, poller, json } from '../app';

const app = routes()
	.post('/api/seen', json<{ keys: string[] }>(), async (c) => {
		const b = c.req.valid('json');
		if (!Array.isArray(b.keys)) return c.json({ error: 'Which items?' }, 400);
		return c.json(await poller(c.env, c.get('user').id).markSeen(b.keys));
	})
	.post('/api/unseen', json<{ keys: string[] }>(), async (c) => {
		const b = c.req.valid('json');
		if (!Array.isArray(b.keys)) return c.json({ error: 'Which items?' }, 400);
		return c.json(await poller(c.env, c.get('user').id).markUnseen(b.keys));
	})
	.post('/api/sync', async (c) => c.json(await poller(c.env, c.get('user').id).pollNow()));

export default app;
