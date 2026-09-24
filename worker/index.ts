import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { classify, validateRules } from '../src/lib/shared/classify';
import { validateDash } from '../src/lib/shared/dashboard';
import type {
	Counts,
	DashKind,
	Enrichment,
	FeedDTO,
	FeedFilter,
	MeDTO,
	Settings,
	ThreadDTO,
	View
} from '../src/lib/shared/types';
import { allowedOrgs, checkAccess } from './access';
import { encryptSecret, randomToken, sha256 } from './crypto';
import {
	bumpVersion,
	parseSettings,
	toDTO,
	userToken,
	viewWhere,
	type Env,
	type ThreadRow,
	type UserRow
} from './db';
import { renderFeed } from './feeds';
import { getViewer, markThreadDone, markThreadRead, muteThread } from './github';
import { MUTED_BY_USER } from './poller';
import { sendPush, vapidFromEnv } from './webpush';

export { Poller } from './poller';

const SESSION_COOKIE = 'hush_sid';
const SESSION_DAYS = 30;
const MAX_DEVICES = 10;
const VIEWS = new Set<View>(['action', 'fyi', 'snoozed', 'done', 'muted', 'all']);

type Vars = { user: UserRow };
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const poller = (env: Env, userId: number) => env.POLLER.get(env.POLLER.idFromName(String(userId)));

/** Approximate, per-location limits against floods. Missing bindings (tests, old config) skip. */
async function overLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
	if (!limiter) return false;
	const { success } = await limiter.limit({ key });
	return !success;
}
const clientIp = (c: Context) => c.req.header('CF-Connecting-IP') ?? 'unknown';
const tooMany = (c: Context) =>
	c.json({ error: 'Too many requests. Wait a minute and try again.' }, 429, {
		'Retry-After': '60'
	});

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

// --- Auth -------------------------------------------------------------------

app.post('/api/auth/login', async (c) => {
	const { token } = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
	if (!token || token.length < 20)
		return c.json({ error: 'Paste a GitHub personal access token.' }, 400);
	let viewer;
	try {
		viewer = await getViewer(token.trim());
	} catch (err) {
		return c.json({ error: (err as Error).message }, 400);
	}
	const { user, scopes } = viewer;
	const access = await checkAccess(token.trim(), allowedOrgs(c.env));
	if (!access.ok) return c.json({ error: access.message }, 403);
	// Classic tokens report scopes; fine-grained tokens report none and cannot read notifications.
	if (scopes.length && !scopes.includes('notifications') && !scopes.includes('repo'))
		return c.json(
			{ error: 'The token needs the "notifications" scope (and "repo" for private repos).' },
			400
		);

	const now = Date.now();
	const { ct, iv } = await encryptSecret(token.trim(), c.env.TOKEN_ENC_KEY);
	await c.env.DB.prepare(
		`INSERT INTO users (id, login, name, avatar_url, token_ct, token_iv, scopes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT (id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url,
       token_ct = excluded.token_ct, token_iv = excluded.token_iv, scopes = excluded.scopes, updated_at = excluded.updated_at,
       access_checked_at = excluded.updated_at, last_seen_at = excluded.updated_at`
	)
		.bind(user.id, user.login, user.name, user.avatar_url, ct, iv, scopes.join(','), now)
		.run();

	const sid = randomToken();
	await c.env.DB.prepare(
		'INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
	)
		.bind(await sha256(sid), user.id, now, now + SESSION_DAYS * 86_400_000)
		.run();
	setCookie(c, SESSION_COOKIE, sid, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_DAYS * 86_400
	});
	await poller(c.env, user.id).start(user.id, new URL(c.req.url).origin);
	return c.json({ ok: true, login: user.login });
});

app.post('/api/auth/logout', async (c) => {
	const sid = getCookie(c, SESSION_COOKIE);
	if (sid)
		await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?')
			.bind(await sha256(sid))
			.run();
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
	return c.json({ ok: true });
});

app.delete('/api/account', async (c) => {
	const u = c.get('user');
	await poller(c.env, u.id).stop();
	await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
	return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
	const u = c.get('user');
	const status = await poller(c.env, u.id).status();
	const me: MeDTO = {
		login: u.login,
		name: u.name,
		avatarUrl: u.avatar_url,
		settings: parseSettings(u.settings),
		lastPollAt: status.lastPollAt,
		lastPollError: status.lastError,
		ssoHiddenOrgs: status.ssoHiddenOrgs ?? 0,
		scopes: u.scopes ? u.scopes.split(',') : []
	};
	return c.json(me);
});

// --- Threads ----------------------------------------------------------------

async function counts(env: Env, userId: number): Promise<Counts> {
	const now = Date.now();
	const row = await env.DB.prepare(
		`SELECT
       SUM(CASE WHEN ${viewWhere('action')} THEN 1 ELSE 0 END) AS action,
       SUM(CASE WHEN ${viewWhere('fyi')} THEN 1 ELSE 0 END) AS fyi,
       SUM(CASE WHEN ${viewWhere('snoozed')} THEN 1 ELSE 0 END) AS snoozed
     FROM threads WHERE user_id = ?1`
	)
		.bind(userId, now)
		.first<Counts>();
	return { action: row?.action ?? 0, fyi: row?.fyi ?? 0, snoozed: row?.snoozed ?? 0 };
}

const SEEN_EVERY = 5 * 60_000;

/**
 * Opening the UI means the user is active: record it and let the poller poll soon. At most once
 * every 5 minutes, so an open tab does not cost a D1 write and a DO request each minute.
 */
function markSeen(c: Ctx, u: UserRow) {
	const now = Date.now();
	if (u.last_seen_at && now - u.last_seen_at < SEEN_EVERY) return;
	c.executionCtx.waitUntil(
		Promise.all([
			c.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, u.id).run(),
			poller(c.env, u.id).touch()
		])
	);
}

app.get('/api/threads', async (c) => {
	const u = c.get('user');
	const view = (c.req.query('view') ?? 'action') as View;
	if (!VIEWS.has(view)) return c.json({ error: 'Unknown view' }, 400);
	markSeen(c, u);
	// Nothing changed since the client's copy: answer 304 without reading any threads.
	const etag = `W/"${u.id}.${u.threads_version}.${view}"`;
	const noStore = { 'Cache-Control': 'private, no-cache', ETag: etag };
	if (c.req.header('If-None-Match') === etag) return c.body(null, 304, noStore);
	const order = view === 'snoozed' ? 'snoozed_until ASC' : 'gh_updated_at DESC';
	const { results } = await c.env.DB.prepare(
		`SELECT * FROM threads WHERE ${viewWhere(view)} ORDER BY ${order} LIMIT 300`
	)
		.bind(u.id, Date.now())
		.all<ThreadRow>();
	const threads: ThreadDTO[] = results.map(toDTO);
	return c.json({ threads, counts: await counts(c.env, u.id) }, 200, noStore);
});

type ThreadAction = 'done' | 'undone' | 'read' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';

app.post('/api/threads/:id/:action', async (c) => {
	const u = c.get('user');
	const id = c.req.param('id');
	const action = c.req.param('action') as ThreadAction;
	const db = c.env.DB;
	const thread = await db
		.prepare('SELECT * FROM threads WHERE user_id = ? AND id = ?')
		.bind(u.id, id)
		.first<ThreadRow>();
	if (!thread) return c.json({ error: 'Not found' }, 404);
	const token = await userToken(c.env, u);
	const set = (sql: string, ...args: unknown[]) =>
		db.batch([
			db.prepare(`UPDATE threads SET ${sql} WHERE user_id = ? AND id = ?`).bind(...args, u.id, id),
			bumpVersion(c.env, u.id)
		]);

	switch (action) {
		case 'done':
			await set(`triage = 'done', snoozed_until = NULL, unread = 0`);
			c.executionCtx.waitUntil(markThreadDone(token, id));
			break;
		case 'undone':
		case 'unsnooze':
			await set(`triage = 'inbox', snoozed_until = NULL`);
			break;
		case 'read':
			await set(`unread = 0`);
			c.executionCtx.waitUntil(markThreadRead(token, id));
			break;
		case 'snooze': {
			const { until } = await c.req.json<{ until?: number }>().catch(() => ({ until: undefined }));
			if (!until || until < Date.now())
				return c.json({ error: 'Snooze time must be in the future.' }, 400);
			await set(`triage = 'snoozed', snoozed_until = ?`, until);
			break;
		}
		case 'mute':
			await set(`category = 'muted', rule = ?, triage = 'done'`, MUTED_BY_USER);
			c.executionCtx.waitUntil(muteThread(token, id).then(() => markThreadDone(token, id)));
			break;
		case 'unmute': {
			const settings = parseSettings(u.settings);
			const cls = classify(factsFromRow(thread, u.login), settings);
			await set(`category = ?, rule = ?, triage = 'inbox'`, cls.category, cls.rule ?? null);
			break;
		}
		default:
			return c.json({ error: 'Unknown action' }, 400);
	}
	return c.json({ ok: true, counts: await counts(c.env, u.id) });
});

app.post('/api/sync', async (c) => {
	const u = c.get('user');
	return c.json(await poller(c.env, u.id).pollNow());
});

// --- Settings ---------------------------------------------------------------

function factsFromRow(r: ThreadRow, me: string, myTeams: string[] = []) {
	return {
		myTeams,
		repo: r.repo,
		subjectType: r.subject_type,
		title: r.title,
		reason: r.reason,
		htmlUrl: r.html_url,
		enrichment: r.enrichment ? (JSON.parse(r.enrichment) as Enrichment) : null,
		me
	};
}

/** Re-run the classifier on stored threads after the settings change. */
async function reclassify(env: Env, u: UserRow, settings: Settings) {
	const myTeams = settings.teamReviewsAreAction
		? (await poller(env, u.id).teams()).teams.map((t) => t.slug)
		: [];
	const { results } = await env.DB.prepare('SELECT * FROM threads WHERE user_id = ?')
		.bind(u.id)
		.all<ThreadRow>();
	const stmts: D1PreparedStatement[] = [];
	for (const r of results) {
		if (r.rule === MUTED_BY_USER) continue;
		const cls = classify(factsFromRow(r, u.login, myTeams), settings);
		const same =
			cls.category === r.category &&
			cls.kind === r.kind &&
			cls.summary === r.summary &&
			(cls.rule ?? null) === r.rule &&
			cls.actionUrl === r.action_url;
		if (same) continue;
		stmts.push(
			env.DB.prepare(
				`UPDATE threads SET category = ?, kind = ?, summary = ?, why = ?, action_label = ?, action_url = ?, rule = ?
         WHERE user_id = ? AND id = ?`
			).bind(
				cls.category,
				cls.kind,
				cls.summary,
				cls.why,
				cls.actionLabel,
				cls.actionUrl,
				cls.rule ?? null,
				u.id,
				r.id
			)
		);
	}
	const changed = stmts.length;
	if (changed) stmts.push(bumpVersion(env, u.id));
	for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
	return changed;
}

app.put('/api/settings', async (c) => {
	const u = c.get('user');
	const body = await c.req.json<Partial<Settings>>().catch(() => null);
	if (!body) return c.json({ error: 'Invalid JSON' }, 400);
	const next: Settings = { ...parseSettings(u.settings) };
	for (const k of ['pushAction', 'pushFyi', 'botsAreFyi', 'teamReviewsAreAction'] as const)
		if (typeof body[k] === 'boolean') next[k] = body[k];
	if (body.dash !== undefined) {
		const dash = { ...next.dash, ...body.dash };
		const err = validateDash(dash);
		if (err) return c.json({ error: err }, 400);
		next.dash = dash;
	}
	if (body.rules !== undefined) {
		const err = validateRules(body.rules);
		if (err) return c.json({ error: err }, 400);
		next.rules = body.rules;
	}
	await c.env.DB.prepare('UPDATE users SET settings = ?, updated_at = ? WHERE id = ?')
		.bind(JSON.stringify(next), Date.now(), u.id)
		.run();
	const changed = await reclassify(c.env, u, next);
	return c.json({ settings: next, reclassified: changed });
});

// --- Web Push ---------------------------------------------------------------

app.get('/api/push/vapid-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }));

app.get('/api/push/subscriptions', async (c) => {
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
});

app.post('/api/push/subscribe', async (c) => {
	const u = c.get('user');
	const body = await c.req
		.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string }; label?: string }>()
		.catch(() => null);
	const endpoint = body?.endpoint;
	if (!endpoint?.startsWith('https://') || !body?.keys?.p256dh || !body.keys.auth)
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
});

app.post('/api/push/unsubscribe', async (c) => {
	const u = c.get('user');
	const { endpoint } = await c.req
		.json<{ endpoint?: string }>()
		.catch(() => ({ endpoint: undefined }));
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
});

app.post('/api/push/test', async (c) => {
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
					url: `${origin}/`,
					tag: 'test'
				},
				vapid
			).catch(() => 0)
		)
	);
	return c.json({ sent: statuses.filter((s) => s >= 200 && s < 300).length, statuses });
});

// --- PR and issue dashboards -----------------------------------------------

app.get('/api/teams', async (c) => {
	const u = c.get('user');
	return c.json(await poller(c.env, u.id).teams(c.req.query('refresh') === '1'));
});

app.get('/api/dashboard/:kind', async (c) => {
	const u = c.get('user');
	const kind = c.req.param('kind') as DashKind;
	if (kind !== 'pr' && kind !== 'issue') return c.json({ error: 'Unknown dashboard' }, 400);
	const [data, hidden] = await Promise.all([
		poller(c.env, u.id).dashboard(kind, c.req.query('refresh') === '1'),
		c.env.DB.prepare('SELECT item_id, updated_at FROM dash_hidden WHERE user_id = ?')
			.bind(u.id)
			.all<{ item_id: string; updated_at: string }>()
	]);
	// Hidden until it changes: a newer updatedAt brings the item back.
	const until = new Map(hidden.results.map((h) => [h.item_id, h.updated_at]));
	for (const i of data.items) {
		const at = until.get(i.id);
		i.dismissed = !!at && Date.parse(i.updatedAt) <= Date.parse(at);
	}
	return c.json(data);
});

app.post('/api/dashboard/hide', async (c) => {
	const body = await c.req.json<{ id?: string; updatedAt?: string }>().catch(() => null);
	if (!body?.id || !body.updatedAt || Number.isNaN(Date.parse(body.updatedAt)))
		return c.json({ error: 'Invalid item' }, 400);
	await c.env.DB.prepare(
		`INSERT INTO dash_hidden (user_id, item_id, updated_at, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, item_id) DO UPDATE SET updated_at = excluded.updated_at`
	)
		.bind(c.get('user').id, body.id, body.updatedAt, Date.now())
		.run();
	return c.json({ ok: true });
});

app.post('/api/dashboard/unhide', async (c) => {
	const body = await c.req.json<{ id?: string }>().catch(() => null);
	await c.env.DB.prepare('DELETE FROM dash_hidden WHERE user_id = ? AND item_id = ?')
		.bind(c.get('user').id, body?.id ?? '')
		.run();
	return c.json({ ok: true });
});

// --- Feeds ------------------------------------------------------------------

function feedDTO(
	origin: string,
	r: { id: string; name: string; token: string; filter: string; created_at: number }
): FeedDTO {
	return {
		id: r.id,
		name: r.name,
		filter: JSON.parse(r.filter),
		url: `${origin}/feeds/${r.token}`,
		createdAt: r.created_at
	};
}

app.get('/api/feeds', async (c) => {
	const { results } = await c.env.DB.prepare(
		'SELECT * FROM feeds WHERE user_id = ? ORDER BY created_at'
	)
		.bind(c.get('user').id)
		.all<{ id: string; name: string; token: string; filter: string; created_at: number }>();
	const origin = new URL(c.req.url).origin;
	return c.json(results.map((r) => feedDTO(origin, r)));
});

app.post('/api/feeds', async (c) => {
	const body = await c.req.json<{ name?: string; filter?: FeedFilter }>().catch(() => null);
	const name = body?.name?.trim();
	const view = body?.filter?.view;
	if (!name) return c.json({ error: 'Give the feed a name.' }, 400);
	if (view !== 'action' && view !== 'fyi' && view !== 'all')
		return c.json({ error: 'Unknown feed view.' }, 400);
	const filter: FeedFilter = {
		view,
		...(body?.filter?.repo?.trim() ? { repo: body.filter.repo.trim() } : {})
	};
	const row = {
		id: randomToken(9),
		name: name.slice(0, 80),
		token: randomToken(24),
		filter: JSON.stringify(filter),
		created_at: Date.now()
	};
	await c.env.DB.prepare(
		'INSERT INTO feeds (id, user_id, name, token, filter, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	)
		.bind(row.id, c.get('user').id, row.name, row.token, row.filter, row.created_at)
		.run();
	return c.json(feedDTO(new URL(c.req.url).origin, row));
});

app.delete('/api/feeds/:id', async (c) => {
	await c.env.DB.prepare('DELETE FROM feeds WHERE user_id = ? AND id = ?')
		.bind(c.get('user').id, c.req.param('id'))
		.run();
	return c.json({ ok: true });
});

app.get('/feeds/:token', (c) =>
	renderFeed(c.env, c.req.param('token').replace(/\.xml$/, ''), new URL(c.req.url).origin)
);

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

// Everything else is the SPA (served by the assets binding).
app.all('*', (c: Ctx) => c.env.ASSETS.fetch(c.req.raw));

export default app;
