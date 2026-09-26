import { randomToken } from '../crypto';
import { sendPush, vapidFromEnv } from '../webpush';
import { routes, poller, json } from '../app';

const MAX_DEVICES = 10;

// --- Web Push ---------------------------------------------------------------

const app = routes()
	.get('/api/push/vapid-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }))
	.get('/api/push/subscriptions', async (c) => {
		const { results } = await c.env.DB.prepare(
			'SELECT id, endpoint, label, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at'
		)
			.bind(c.get('user').id)
			.all<{ id: string; endpoint: string; label: string | null; created_at: number }>();
		return c.json(
			results.map((r) => ({
				id: r.id,
				endpoint: r.endpoint,
				label: r.label,
				createdAt: r.created_at
			}))
		);
	})
	.post(
		'/api/push/subscribe',
		json<{ endpoint: string; keys: { p256dh: string; auth: string }; label: string }>(),
		async (c) => {
			const u = c.get('user');
			const body = c.req.valid('json');
			const endpoint = body.endpoint;
			if (!endpoint?.startsWith('https://') || !body.keys?.p256dh || !body.keys.auth)
				return c.json({ error: 'Invalid push subscription' }, 400);
			// Each device costs a request per push; keep a poll well inside the subrequest limit.
			const devices = await c.env.DB.prepare(
				'SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ? AND endpoint != ?'
			)
				.bind(u.id, endpoint)
				.first<{ n: number }>();
			if ((devices?.n ?? 0) >= MAX_DEVICES)
				return c.json(
					{ error: `Up to ${MAX_DEVICES} devices can get push. Remove one in Settings first.` },
					400
				);
			await c.env.DB.prepare(
				`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       label = excluded.label`
			)
				.bind(
					randomToken(12),
					u.id,
					endpoint,
					body.keys.p256dh,
					body.keys.auth,
					body.label?.slice(0, 80) ?? null,
					Date.now()
				)
				.run();
			await poller(c.env, u.id).setHasPush(true);
			return c.json({ ok: true });
		}
	)
	.post('/api/push/unsubscribe', json<{ endpoint: string }>(), async (c) => {
		const u = c.get('user');
		const { endpoint } = c.req.valid('json');
		await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
			.bind(u.id, endpoint ?? '')
			.run();
		const left = await c.env.DB.prepare(
			'SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?'
		)
			.bind(u.id)
			.first<{ n: number }>();
		await poller(c.env, u.id).setHasPush((left?.n ?? 0) > 0);
		return c.json({ ok: true });
	})
	.post('/api/push/test', async (c) => {
		const u = c.get('user');
		if (!c.env.VAPID_PRIVATE_KEY)
			return c.json({ error: 'VAPID keys are not configured on the server.' }, 500);
		const { results } = await c.env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
			.bind(u.id)
			.all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
		if (!results.length) return c.json({ error: 'No devices are subscribed.' }, 400);
		const origin = new URL(c.req.url).origin;
		const vapid = vapidFromEnv(c.env, origin);
		const statuses = await Promise.all(
			results.map((s) =>
				sendPush(
					s,
					{
						title: 'Hush is connected',
						body: 'Push notifications work on this device.',
						url: `${origin}/inbox`,
						tag: 'test'
					},
					vapid
				).catch(() => 0)
			)
		);
		return c.json({ sent: statuses.filter((s) => s >= 200 && s < 300).length, statuses });
	});

export default app;
