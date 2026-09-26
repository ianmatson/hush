import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { sha256 } from './crypto';
import type { UserRow } from './db';
import { clientIp, overLimit, SESSION_COOKIE, tooMany, type AppEnv, type Ctx } from './app';
import alerts from './routes/alerts';
import auth from './routes/auth';
import dashboard from './routes/dashboard';
import feeds from './routes/feeds';
import push from './routes/push';
import settings from './routes/settings';
import subjects from './routes/subjects';
import threads from './routes/threads';

export { Poller } from './poller';

const app = new Hono<AppEnv>();

app.use('/api/auth/login', async (c, next) => {
	if (await overLimit(c.env.AUTH_LIMIT, `login:${clientIp(c)}`)) return tooMany(c);
	await next();
});

app.use('/feeds/*', async (c, next) => {
	if (await overLimit(c.env.FEED_LIMIT, `feed:${clientIp(c)}`)) return tooMany(c);
	await next();
});

// Cookies are SameSite=Lax; also reject cross-origin writes.
app.use('/api/*', async (c, next) => {
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		const origin = c.req.header('Origin');
		if (origin && origin !== new URL(c.req.url).origin)
			return c.json({ error: 'Cross-origin request' }, 403);
	}
	await next();
});

app.use('/api/*', async (c, next) => {
	const open = ['/api/auth/login', '/api/push/vapid-key', '/api/health'];
	if (open.includes(c.req.path)) return next();
	const sid = getCookie(c, SESSION_COOKIE);
	if (!sid) {
		if (await overLimit(c.env.API_LIMIT, `ip:${clientIp(c)}`)) return tooMany(c);
		return c.json({ error: 'Not signed in' }, 401);
	}
	const row = await c.env.DB.prepare(
		'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?'
	)
		.bind(await sha256(sid), Date.now())
		.first<UserRow>();
	if (!row) return c.json({ error: 'Not signed in' }, 401);
	if (await overLimit(c.env.API_LIMIT, `user:${row.id}`)) return tooMany(c);
	c.set('user', row);
	await next();
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/health', (c) => c.json({ ok: true }));

// Route groups, in the order they were registered before the split.
for (const group of [auth, threads, settings, push, alerts, subjects, dashboard, feeds])
	app.route('/', group);

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Everything else is the SPA (served by the assets binding).
app.all('*', (c: Ctx) => c.env.ASSETS.fetch(c.req.raw));

export default app;
