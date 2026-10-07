import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie } from 'hono/cookie';
import { sha256 } from './crypto';
import type { UserRow } from './db';
import { SESSION_IDLE_DAYS, SESSION_TOUCH_MS } from '../src/lib/shared/session';
import { clientIp, overLimit, SESSION_COOKIE, tooMany, type AppEnv, type Ctx } from './app';
import alerts from './routes/alerts';
import auth from './routes/auth';
import dashboard from './routes/dashboard';
import feeds from './routes/feeds';
import live from './routes/live';
import push from './routes/push';
import settings from './routes/settings';
import slack from './routes/slack';
import subjects from './routes/subjects';
import actions from './routes/actions';
import suggest from './routes/suggest';
import threads from './routes/threads';

export { Poller } from './poller';

const app = new Hono<AppEnv>();
const DAY = 86_400_000;

app.use('/api/auth/*', async (c, next) => {
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
	const open = [
		'/api/auth/github',
		'/api/auth/callback',
		'/api/push/vapid-key',
		'/api/health',
		'/api/slack/events'
	];
	if (open.includes(c.req.path)) return next();
	const sid = getCookie(c, SESSION_COOKIE);
	if (!sid) {
		if (await overLimit(c.env.API_LIMIT, `ip:${clientIp(c)}`)) return tooMany(c);
		return c.json({ error: 'Not signed in' }, 401);
	}
	// A session ends 30 days after sign-in, or after 7 days with no use.
	const now = Date.now();
	const hash = await sha256(sid);
	const row = await c.env.DB.prepare(
		`SELECT u.*, s.last_seen_at AS session_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND s.expires_at > ? AND s.last_seen_at > ?`
	)
		.bind(hash, now, now - SESSION_IDLE_DAYS * DAY)
		.first<UserRow & { session_seen_at: number }>();
	if (!row) return c.json({ error: 'Not signed in' }, 401);
	if (await overLimit(c.env.API_LIMIT, `user:${row.id}`)) return tooMany(c);
	// The last use, at most once an hour: enough for the 7-day limit, and few writes.
	if (now - row.session_seen_at > SESSION_TOUCH_MS)
		c.executionCtx.waitUntil(
			c.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?')
				.bind(now, hash)
				.run()
		);
	const { session_seen_at: _, ...user } = row;
	c.set('user', user);
	c.set('session', hash);
	await next();
});

app.get('/api/health', (c) => c.json({ ok: true }));

// Route groups, in the order they were registered before the split. One chain, so that
// `AppType` carries every route's input and output types (the browser's typed client uses it).
const api = app
	.route('/', auth)
	.route('/', threads)
	.route('/', settings)
	.route('/', push)
	.route('/', slack)
	.route('/', alerts)
	.route('/', subjects)
	.route('/', actions)
	.route('/', suggest)
	.route('/', dashboard)
	.route('/', feeds)
	.route('/', live);
export type AppType = typeof api;

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Errors that Hono raises itself (for example a JSON body that does not parse) answer in the same
// { error } form as the routes. Anything else is a bug: log it, and answer 500.
app.onError((err, c) => {
	if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
	console.error('unhandled', err);
	return c.json({ error: 'Something went wrong.' }, 500);
});

// Everything else is the SPA (served by the assets binding).
app.all('*', (c: Ctx) => c.env.ASSETS.fetch(c.req.raw));

export default app;
