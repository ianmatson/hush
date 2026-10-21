import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { SESSION_IDLE_MS } from '../../src/lib/shared/session';
import { SESSION_COOKIE, clientIp, overLimit, tooMany, type AppEnv } from '../app';
import { sha256 } from '../crypto';
import { authorization, protectedResource, remoteMcp } from '../assistant/remote';
import { mcpResource, type BrowserPrincipal } from '../assistant/oauth';
import type { McpConsentDecision } from '../../src/lib/shared/mcp';

const app = new Hono<AppEnv>();
const paths = [
	'/mcp',
	'/oauth/authorize',
	'/oauth/token',
	'/oauth/register',
	'/oauth/consent',
	'/.well-known/oauth-authorization-server',
	'/.well-known/oauth-protected-resource/mcp',
	'/api/mcp/*'
];
for (const path of paths) {
	app.use(path, bodyLimit({ maxSize: 64 * 1024 }));
	app.use(path, async (c, next) => {
		const authorizationRequest =
			c.req.path === '/oauth/authorize' ||
			(c.req.method === 'POST' &&
				['/oauth/register', '/oauth/token', '/api/mcp/consent'].includes(c.req.path));
		const limiter = authorizationRequest ? c.env.AUTH_LIMIT : c.env.API_LIMIT;
		if (await overLimit(limiter, `mcp:${clientIp(c)}`)) return tooMany(c);
		c.header('Cache-Control', 'no-store');
		c.header('Referrer-Policy', 'no-referrer');
		c.header('X-Frame-Options', 'DENY');
		c.header('Content-Security-Policy', "frame-ancestors 'none'");
		await next();
	});
}

async function principal(c: import('hono').Context<AppEnv>): Promise<BrowserPrincipal | null> {
	const sid = getCookie(c, SESSION_COOKIE);
	if (!sid) return null;
	const session = await sha256(sid);
	const now = Date.now();
	const user = await c.env.DB.prepare(
		`SELECT u.id, u.login FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ? AND s.last_seen_at > ?`
	)
		.bind(session, now, now - SESSION_IDLE_MS)
		.first<{ id: number; login: string }>();
	return user ? { userId: user.id, login: user.login, session } : null;
}

app.all('/mcp', (c) => remoteMcp(c.req.raw, c.env));
app.get('/oauth/consent', (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/.well-known/oauth-protected-resource/mcp', (c) => protectedResource(c.env));

for (const path of ['/.well-known/oauth-authorization-server', '/oauth/token', '/oauth/register']) {
	app.all(path, async (c) => {
		const auth = authorization(c.env);
		if (!auth) return c.json({ error: 'MCP is not configured' }, 503);
		const canonical = new URL(c.req.url);
		return auth.protocol(
			new Request(new URL(canonical.pathname + canonical.search, c.env.APP_URL), c.req.raw)
		);
	});
}

app.get('/oauth/authorize', async (c) => {
	const auth = authorization(c.env);
	if (!auth) return c.json({ error: 'MCP is not configured' }, 503);
	const user = await principal(c);
	if (!user)
		return c.html(
			'<!doctype html><meta name="viewport" content="width=device-width"><title>Sign in to Hush</title><h1>Sign in to Hush first</h1><p>After sign-in, restart the connection from your MCP app.</p><a href="/login">Sign in</a>',
			401
		);
	return auth.begin(
		new Request(new URL('/oauth/authorize' + new URL(c.req.url).search, c.env.APP_URL), c.req.raw),
		user
	);
});

app.all('/api/mcp/*', async (c) => {
	const auth = authorization(c.env);
	if (!auth) return c.json({ error: 'MCP is not configured' }, 503);
	const user = await principal(c);
	if (!user) return c.json({ error: 'Sign in to Hush, then restart the connection.' }, 401);
	if (c.req.method !== 'GET' && c.req.header('Origin') !== new URL(c.req.url).origin)
		return c.json({ error: 'Invalid request origin' }, 403);
	const csrfToken = await sha256(`${user.session}:mcp-management`);
	try {
		if (c.req.path === '/api/mcp/consent' && c.req.method === 'GET') {
			const result = await auth.consent(c.req.query('request') ?? '', user);
			return 'error' in result ? c.json(result, 400) : c.json(result);
		}
		if (c.req.path === '/api/mcp/consent' && c.req.method === 'POST') {
			const decision = await c.req.json<McpConsentDecision>();
			if (
				!decision ||
				typeof decision.requestId !== 'string' ||
				typeof decision.csrfToken !== 'string'
			)
				return c.json({ error: 'Invalid consent request' }, 400);
			return auth.decide(
				new Request(c.req.url, { method: c.req.method, headers: c.req.raw.headers }),
				user,
				decision
			);
		}
		if (c.req.path === '/api/mcp/grants' && c.req.method === 'GET')
			return c.json({ resource: mcpResource(c.env), grants: await auth.grants(user), csrfToken });
		const revoke = /^\/api\/mcp\/grants\/([A-Za-z0-9_-]{1,100})\/revoke$/.exec(c.req.path);
		if (revoke && c.req.method === 'POST') {
			const body = await c.req.json<{ csrfToken?: string }>();
			if (body?.csrfToken !== csrfToken) return c.json({ error: 'Invalid security token' }, 403);
			await auth.revoke(user.userId, revoke[1]);
			return c.json({ ok: true });
		}
		return c.json({ error: 'Not found' }, 404);
	} catch (error) {
		if (error instanceof SyntaxError) return c.json({ error: 'Invalid request' }, 400);
		throw error;
	}
});

export default app;
