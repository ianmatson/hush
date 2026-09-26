import { routes, poller, json } from '../app';

// --- Web Push (the devices are in the user's Durable Object: poller/data.ts) ------------

const app = routes()
	.get('/api/push/vapid-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }))
	.get('/api/push/subscriptions', async (c) =>
		c.json(await poller(c.env, c.get('user').id).pushDevices())
	)
	.post(
		'/api/push/subscribe',
		json<{ endpoint: string; keys: { p256dh: string; auth: string }; label: string }>(),
		async (c) => {
			const r = await poller(c.env, c.get('user').id).subscribe(c.req.valid('json'));
			if ('error' in r) return c.json({ error: r.error }, r.status);
			return c.json(r);
		}
	)
	.post('/api/push/unsubscribe', json<{ endpoint: string }>(), async (c) =>
		c.json(await poller(c.env, c.get('user').id).unsubscribe(c.req.valid('json').endpoint ?? ''))
	)
	.post('/api/push/test', async (c) => {
		const r = await poller(c.env, c.get('user').id).testPush(new URL(c.req.url).origin);
		if ('error' in r) return c.json({ error: r.error }, r.status);
		return c.json(r);
	});

export default app;
