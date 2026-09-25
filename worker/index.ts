import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
	classify,
	classifyDefault,
	firstMatchingRule,
	validateRules
} from '../src/lib/shared/classify';
import { validateDash } from '../src/lib/shared/dashboard';
import { MENUS_VERSION, validateMenus } from '../src/lib/shared/menus';
import { validateViews } from '../src/lib/shared/views';
import {
	SNOOZE_EVENT_MAX_MS,
	snoozeEvent,
	snoozeOutcome,
	type SnoozeEvent
} from '../src/lib/shared/snooze';
import type {
	Counts,
	DashItem,
	DashKind,
	Enrichment,
	FeedDTO,
	FeedFilter,
	MeDTO,
	Rule,
	Settings,
	ThreadDTO,
	Turn,
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
import {
	fetchPeek,
	getViewer,
	GitHubError,
	markThreadDone,
	markThreadRead,
	muteThread
} from './github';
import { MUTED_BY_USER } from './poller';
import { sendPush, vapidFromEnv } from './webpush';

export { Poller } from './poller';

const SESSION_COOKIE = 'hush_sid';
const SESSION_DAYS = 30;
const MAX_DEVICES = 10;
const VIEWS = new Set<View>(['action', 'fyi', 'snoozed', 'done', 'muted', 'all', 'inbox']);

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
		nextPollAt: status.nextPollAt,
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

type ThreadAction =
	'done' | 'undone' | 'read' | 'unread' | 'snooze' | 'unsnooze' | 'mute' | 'unmute';
const THREAD_ACTIONS = new Set<ThreadAction>([
	'done',
	'undone',
	'read',
	'unread',
	'snooze',
	'unsnooze',
	'mute',
	'unmute'
]);
// Mute makes 2 GitHub calls per thread; 20 × 2 stays under the Free plan's 50 subrequests.
const BULK_MAX = 20;

/** Apply one triage action to up to BULK_MAX threads: one D1 batch, one version bump. */
async function applyThreadAction(c: Ctx, ids: string[], action: ThreadAction) {
	const u = c.get('user');
	const db = c.env.DB;
	if (!THREAD_ACTIONS.has(action)) return c.json({ error: 'Unknown action' }, 400);
	if (!ids.length || ids.length > BULK_MAX || ids.some((id) => typeof id !== 'string'))
		return c.json({ error: `Select 1 to ${BULK_MAX} threads.` }, 400);
	const body = await c.req
		.json<{ until?: number; event?: SnoozeEvent }>()
		.catch(() => ({}) as { until?: number; event?: SnoozeEvent });
	// "Until something happens": the time is only a deadline (default 7 days).
	const event = action === 'snooze' ? (body.event ?? null) : null;
	if (event && !snoozeEvent(event)) return c.json({ error: 'Unknown snooze condition.' }, 400);
	if (event) body.until ??= Date.now() + SNOOZE_EVENT_MAX_MS;
	if (action === 'snooze' && (!body.until || body.until < Date.now()))
		return c.json({ error: 'Snooze time must be in the future.' }, 400);

	const { results: threads } = await db
		.prepare(`SELECT * FROM threads WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
		.bind(u.id, ...ids)
		.all<ThreadRow>();
	if (!threads.length) return c.json({ error: 'Not found' }, 404);
	// A state that is already true would wake the thread at once: refuse it with a clear reason.
	if (event) {
		const ev = snoozeEvent(event)!;
		const now = Date.now();
		// Only PRs and issues have the data these conditions read.
		const kindOf = (t: ThreadRow) =>
			t.enrichment ? (JSON.parse(t.enrichment) as Enrichment).kind : 'other';
		if (threads.some((t) => !ev.kinds.includes(kindOf(t) as 'pr' | 'issue')))
			return c.json(
				{
					error: `"${ev.label}" works only for ${ev.kinds.map((k) => (k === 'pr' ? 'pull requests' : 'issues')).join(' and ')}.`
				},
				400
			);
		// Refuse what would end at once: the event already happened, or the PR is already closed.
		const endsNow = (t: ThreadRow) =>
			snoozeOutcome(
				ev.id,
				t.enrichment ? (JSON.parse(t.enrichment) as Enrichment) : null,
				now,
				u.login
			);
		const already = threads.filter((t) => endsNow(t).wake);
		if (already.length === threads.length) {
			const o = endsNow(already[0]);
			return c.json(
				{ error: `${o.wake ? o.reason : 'Done'} already. Pick another condition.` },
				400
			);
		}
		if (already.length)
			threads.splice(0, threads.length, ...threads.filter((t) => !already.includes(t)));
	}

	// Your own triage choice replaces an automatic one (see the inbox watcher).
	const NOT_AUTO = `resolved_at = NULL, resolved_note = NULL`;
	const update = (t: ThreadRow, sql: string, ...args: unknown[]) =>
		db.prepare(`UPDATE threads SET ${sql} WHERE user_id = ? AND id = ?`).bind(...args, u.id, t.id);
	const settings = action === 'unmute' ? parseSettings(u.settings) : null;
	const stmts = threads.map((t) => {
		switch (action) {
			case 'done':
				return update(
					t,
					`triage = 'done', snoozed_until = NULL, snooze_event = NULL, unread = 0, ${NOT_AUTO}`
				);
			case 'undone':
			case 'unsnooze':
				return update(
					t,
					`triage = 'inbox', snoozed_until = NULL, snooze_event = NULL, ${NOT_AUTO}`
				);
			case 'read':
				return update(t, `unread = 0, marked_unread_at = NULL`);
			// GitHub has no "mark as unread" API, so this one stays in Hush (and the read sync from
			// GitHub leaves it alone until you read the thread there again).
			case 'unread':
				return update(t, `unread = 1, marked_unread_at = ?`, Date.now());
			case 'snooze':
				return update(
					t,
					`triage = 'snoozed', snoozed_until = ?, snooze_event = ?, snoozed_at = ?`,
					body.until,
					event,
					Date.now()
				);
			case 'mute':
				return update(
					t,
					`category = 'muted', rule = ?, triage = 'done', snoozed_until = NULL, snooze_event = NULL`,
					MUTED_BY_USER
				);
			case 'unmute': {
				const cls = classify(factsFromRow(t, u.login), settings!);
				return update(
					t,
					`category = ?, rule = ?, triage = 'inbox'`,
					cls.category,
					cls.rule ?? null
				);
			}
		}
	});
	await db.batch([...stmts, bumpVersion(c.env, u.id)]);

	// Mirror the change on GitHub in the background.
	if (action === 'done' || action === 'read' || action === 'mute') {
		const token = await userToken(c.env, u);
		const mirror = (id: string) =>
			action === 'done'
				? markThreadDone(token, id)
				: action === 'read'
					? markThreadRead(token, id)
					: muteThread(token, id).then(() => markThreadDone(token, id));
		c.executionCtx.waitUntil(Promise.allSettled(threads.map((t) => mirror(t.id))));
	}
	return c.json({ ok: true, updated: threads.length, counts: await counts(c.env, u.id) });
}

// Before the :id route, so "bulk" is not read as a thread id.
app.post('/api/threads/bulk/:action', async (c) => {
	const ids = c.req.query('ids')?.split(',').filter(Boolean) ?? [];
	return applyThreadAction(c, ids, c.req.param('action') as ThreadAction);
});

app.post('/api/threads/:id/:action', (c) =>
	applyThreadAction(c, [c.req.param('id')], c.req.param('action') as ThreadAction)
);

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

/**
 * Try rules on your stored threads without saving them: how many threads each rule would catch
 * (first match wins), a few examples, and how many threads would change category compared with
 * the saved rules. D1 only.
 */
app.post('/api/rules/preview', async (c) => {
	const u = c.get('user');
	const body = await c.req.json<{ rules?: unknown }>().catch(() => null);
	const err = validateRules(body?.rules);
	if (err) return c.json({ error: err }, 400);
	const rules = body!.rules as Rule[];
	const saved = parseSettings(u.settings);
	const settings: Settings = { ...saved, rules };
	const myTeams = settings.teamReviewsAreAction
		? (await poller(c.env, u.id).teams()).teams.map((t) => t.slug)
		: [];
	const { results } = await c.env.DB.prepare('SELECT * FROM threads WHERE user_id = ?')
		.bind(u.id)
		.all<ThreadRow>();
	type Example = { title: string; repo: string; category: string };
	const perRule = rules.map(() => ({
		matches: 0,
		inInbox: 0,
		open: [] as Example[],
		other: [] as Example[]
	}));
	const moves = { action: 0, fyi: 0, muted: 0 };
	for (const r of results) {
		if (r.rule === MUTED_BY_USER) continue;
		const facts = factsFromRow(r, u.login, myTeams);
		const base = classifyDefault(facts, settings);
		const i = firstMatchingRule(facts, rules, base);
		const categoryWith = (list: Rule[], k: number) =>
			k < 0 ? base.category : (list[k].then.category ?? base.category);
		const category = categoryWith(rules, i);
		if (i >= 0) {
			const p = perRule[i];
			p.matches++;
			const open = r.triage === 'inbox' || r.triage === 'snoozed';
			if (open) p.inInbox++;
			const list = open ? p.open : p.other;
			if (list.length < 3) list.push({ title: r.title, repo: r.repo, category });
		}
		// The effect of your edits: compare with the rules you have saved now.
		const before = categoryWith(saved.rules, firstMatchingRule(facts, saved.rules, base));
		if (category !== before) moves[category as keyof typeof moves]++;
	}
	return c.json({
		// Examples: threads in the inbox first.
		perRule: perRule.map(({ open, other, ...p }) => ({
			...p,
			examples: [...open, ...other].slice(0, 3)
		})),
		moves,
		total: results.length
	});
});

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
	if (body.views !== undefined) {
		// A view's conditions are checked like a rule's (a rule with a no-op result).
		const whenError = (when: unknown) =>
			validateRules([{ when, then: { category: 'fyi' } }])?.replace(/^Rule 1: /, '') ?? null;
		const err = validateViews(body.views, whenError);
		if (err) return c.json({ error: err }, 400);
		next.views = body.views;
	}
	if (body.menus !== undefined) {
		const menus = { ...next.menus, ...body.menus, v: MENUS_VERSION };
		const err = validateMenus(menus);
		if (err) return c.json({ error: err }, 400);
		next.menus = menus;
	}
	if (body.rules !== undefined) {
		const err = validateRules(body.rules);
		if (err) return c.json({ error: err }, 400);
		next.rules = body.rules;
	}
	await c.env.DB.prepare('UPDATE users SET settings = ?, updated_at = ? WHERE id = ?')
		.bind(JSON.stringify(next), Date.now(), u.id)
		.run();
	// Only these settings change how threads are classified; the rest (menus, dashboards, push)
	// must not rewrite every thread.
	const affects =
		body.rules !== undefined ||
		typeof body.botsAreFyi === 'boolean' ||
		typeof body.teamReviewsAreAction === 'boolean';
	const changed = affects ? await reclassify(c.env, u, next) : 0;
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

// --- Quick check -----------------------------------------------------------

// GitHub owner or repo name. Names of only dots ("..") are not allowed.
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

/** You came back from a PR or issue on GitHub: look at it again now, not in 15 minutes. */
app.post('/api/recheck', async (c) => {
	const u = c.get('user');
	const body = (await c.req.json().catch(() => ({}))) as { repo?: unknown; number?: unknown };
	const repo = typeof body.repo === 'string' ? body.repo : '';
	const [owner, name, extra] = repo.split('/');
	const number = Number(body.number);
	if (
		!NAME.test(owner ?? '') ||
		!NAME.test(name ?? '') ||
		extra !== undefined ||
		!Number.isInteger(number) ||
		number < 1
	)
		return c.json({ error: 'Not a PR or issue.' }, 400);
	return c.json(await poller(c.env, u.id).recheck(repo, number));
});

// --- Peek ------------------------------------------------------------------

app.get('/api/peek/:owner/:repo/:number', async (c) => {
	const u = c.get('user');
	const { owner, repo } = c.req.param();
	const number = Number(c.req.param('number'));
	if (!NAME.test(owner) || !NAME.test(repo) || !Number.isInteger(number) || number < 1)
		return c.json({ error: 'Not a PR or issue.' }, 400);
	try {
		const peek = await fetchPeek(await userToken(c.env, u), owner, repo, number);
		if (!peek)
			return c.json(
				{ error: 'GitHub did not find this PR or issue. Maybe you have no access.' },
				404
			);
		return c.json(peek, 200, { 'Cache-Control': 'private, no-store' });
	} catch (err) {
		const status = err instanceof GitHubError && err.status === 401 ? 401 : 502;
		return c.json({ error: (err as Error).message }, status);
	}
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
	const perUser = <T>(sql: string) => c.env.DB.prepare(sql).bind(u.id).all<T>();
	const [data, hidden, moves, order] = await Promise.all([
		poller(c.env, u.id).dashboard(kind, c.req.query('refresh') === '1'),
		perUser<{ item_id: string; updated_at: string }>(
			'SELECT item_id, updated_at FROM dash_hidden WHERE user_id = ?'
		),
		perUser<{ item_id: string; turn: Turn; updated_at: string }>(
			'SELECT item_id, turn, updated_at FROM dash_moves WHERE user_id = ?'
		),
		perUser<{ item_id: string; rank: number }>(
			'SELECT item_id, rank FROM dash_order WHERE user_id = ?'
		)
	]);
	// Hidden and moved last "until it changes": a newer updatedAt undoes them.
	const unchanged = (i: DashItem, at: string | undefined) =>
		!!at && Date.parse(i.updatedAt) <= Date.parse(at);
	const hiddenAt = new Map(hidden.results.map((h) => [h.item_id, h.updated_at]));
	const moved = new Map(moves.results.map((m) => [m.item_id, m]));
	const ranks = new Map(order.results.map((o) => [o.item_id, o.rank]));
	for (const i of data.items) {
		i.dismissed = unchanged(i, hiddenAt.get(i.id));
		const m = moved.get(i.id);
		i.autoTurn = i.turn;
		i.movedByYou = !!m && unchanged(i, m.updated_at) && m.turn !== i.turn;
		if (i.movedByYou) i.turn = m!.turn;
		i.rank = ranks.get(i.id) ?? null;
	}
	return c.json(data);
});

const TURNS = new Set<Turn>(['you', 'team', 'them', 'none']);

/**
 * Save a drop: an optional move to another group (`turn`, or null to undo a move) and the new
 * order of the target group.
 */
type ItemRef = { id: string; updatedAt: string };
const validRefs = (items: unknown): items is ItemRef[] =>
	Array.isArray(items) &&
	items.length > 0 &&
	items.length <= 300 &&
	items.every(
		(i) =>
			typeof i?.id === 'string' &&
			i.id.length <= 100 &&
			typeof i.updatedAt === 'string' &&
			!Number.isNaN(Date.parse(i.updatedAt))
	);

/**
 * Save a drop. Each item may carry `turn`: a group to move it to, null to undo your move, or
 * absent to leave it. `order` is the new order of the target group.
 */
app.post('/api/dashboard/arrange', async (c) => {
	const u = c.get('user');
	const body = await c.req.json<{ items?: unknown; order?: string[] }>().catch(() => null);
	if (!body || !validRefs(body.items)) return c.json({ error: 'Invalid items' }, 400);
	const items = body.items as (ItemRef & { turn?: Turn | null })[];
	if (items.some((i) => i.turn != null && !TURNS.has(i.turn)))
		return c.json({ error: 'Unknown group' }, 400);
	const order = body.order ?? [];
	if (
		!Array.isArray(order) ||
		order.length > 300 ||
		order.some((id) => typeof id !== 'string' || id.length > 100)
	)
		return c.json({ error: 'Invalid order' }, 400);

	const db = c.env.DB;
	const stmts: D1PreparedStatement[] = [];
	for (const item of items) {
		if (item.turn === null)
			stmts.push(
				db.prepare('DELETE FROM dash_moves WHERE user_id = ? AND item_id = ?').bind(u.id, item.id)
			);
		else if (item.turn)
			stmts.push(
				db
					.prepare(
						`INSERT INTO dash_moves (user_id, item_id, turn, updated_at, created_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (user_id, item_id) DO UPDATE SET turn = excluded.turn, updated_at = excluded.updated_at`
					)
					.bind(u.id, item.id, item.turn, item.updatedAt, Date.now())
			);
	}
	order.forEach((id, rank) =>
		stmts.push(
			db
				.prepare(
					`INSERT INTO dash_order (user_id, item_id, rank) VALUES (?, ?, ?)
           ON CONFLICT (user_id, item_id) DO UPDATE SET rank = excluded.rank`
				)
				.bind(u.id, id, rank)
		)
	);
	if (stmts.length) await db.batch(stmts);
	return c.json({ ok: true });
});

app.post('/api/dashboard/hide', async (c) => {
	const u = c.get('user');
	const body = await c.req.json<{ items?: unknown }>().catch(() => null);
	if (!body || !validRefs(body.items)) return c.json({ error: 'Invalid items' }, 400);
	await c.env.DB.batch(
		body.items.map((i) =>
			c.env.DB.prepare(
				`INSERT INTO dash_hidden (user_id, item_id, updated_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET updated_at = excluded.updated_at`
			).bind(u.id, i.id, i.updatedAt, Date.now())
		)
	);
	return c.json({ ok: true });
});

app.post('/api/dashboard/unhide', async (c) => {
	const u = c.get('user');
	const body = await c.req.json<{ ids?: unknown }>().catch(() => null);
	const ids = Array.isArray(body?.ids)
		? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 300)
		: [];
	if (!ids.length) return c.json({ error: 'Invalid items' }, 400);
	await c.env.DB.batch(
		ids.map((id) =>
			c.env.DB.prepare('DELETE FROM dash_hidden WHERE user_id = ? AND item_id = ?').bind(u.id, id)
		)
	);
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
