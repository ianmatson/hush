import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { MeDTO, OrgAccess } from '../../src/lib/shared/types';
import { encryptSecret, randomToken, sha256 } from '../crypto';
import { appToken, getUser, type Env } from '../db';
import { getViewer, gh, type GhUser } from '../github';
import { routes, SESSION_COOKIE, SESSION_DAYS, poller, json, type AppEnv } from '../app';

// --- Auth: Sign in with GitHub (an OAuth app), and your own token as an option ------------

/** The scopes Hush asks for: read notifications, private repos, and your teams. */
const SCOPES = 'notifications repo read:org';
/** The OAuth `state`, and whether the sign-in replaces your own token with the app's. */
const STATE_COOKIE = 'hush_oauth';

/** The user of a token, and its scopes; or why Hush cannot use it. */
async function inspect(
	token: string
): Promise<{ user: GhUser; scopes: string[] } | { error: string }> {
	let viewer;
	try {
		viewer = await getViewer(token);
	} catch (err) {
		return { error: (err as Error).message };
	}
	// Classic and OAuth tokens report scopes; fine-grained tokens report none and cannot read
	// notifications.
	const { scopes } = viewer;
	if (scopes.length && !scopes.includes('notifications') && !scopes.includes('repo'))
		return { error: 'The token needs the "notifications" scope (and "repo" for private repos).' };
	return viewer;
}

/**
 * Save the user's GitHub profile; the token Hush uses, when there is one to store; and the
 * sign-in token, kept also while a custom token is in use (the org access check uses it).
 */
async function saveUser(
	env: Env,
	user: GhUser,
	token: { value: string; scopes: string[]; source: 'app' | 'own' } | null,
	signIn: string | null = null
) {
	const now = Date.now();
	const db = env.DB;
	const writes = [
		db
			.prepare(
				`INSERT INTO users (id, login, name, avatar_url, token_ct, token_iv, scopes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, '', '', '', ?5, ?5)
       ON CONFLICT (id) DO UPDATE SET login = excluded.login, name = excluded.name,
         avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`
			)
			.bind(user.id, user.login, user.name, user.avatar_url, now)
	];
	if (token) {
		const { ct, iv } = await encryptSecret(token.value, env.TOKEN_ENC_KEY);
		writes.push(
			db
				.prepare(
					`UPDATE users SET token_ct = ?, token_iv = ?, scopes = ?, token_source = ? WHERE id = ?`
				)
				.bind(ct, iv, token.scopes.join(','), token.source, user.id)
		);
	}
	if (signIn) {
		const { ct, iv } = await encryptSecret(signIn, env.TOKEN_ENC_KEY);
		writes.push(
			db
				.prepare('UPDATE users SET app_token_ct = ?, app_token_iv = ? WHERE id = ?')
				.bind(ct, iv, user.id)
		);
	}
	// One transaction: a new user never exists without a token.
	await db.batch(writes);
}

async function startSession(c: Context<AppEnv>, userId: number) {
	const now = Date.now();
	const sid = randomToken();
	await c.env.DB.prepare(
		'INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
	)
		.bind(await sha256(sid), userId, now, now + SESSION_DAYS * 86_400_000)
		.run();
	setCookie(c, SESSION_COOKIE, sid, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_DAYS * 86_400
	});
}

const callbackUrl = (env: Env) => `${env.APP_URL}/api/auth/callback`;

const app = routes()
	/** Start Sign in with GitHub. `?use=app` also replaces your own token with the app's. */
	.get('/api/auth/github', (c) => {
		const state = randomToken(16);
		setCookie(c, STATE_COOKIE, `${state}.${c.req.query('use') === 'app' ? 'app' : ''}`, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/api/auth',
			maxAge: 600
		});
		const url = new URL('https://github.com/login/oauth/authorize');
		url.search = new URLSearchParams({
			client_id: c.env.GITHUB_CLIENT_ID,
			redirect_uri: callbackUrl(c.env),
			scope: SCOPES,
			state,
			allow_signup: 'false'
		}).toString();
		return c.redirect(url.toString());
	})
	/** GitHub sends you back here: check the state, get the token, and start the session. */
	.get('/api/auth/callback', async (c) => {
		const [state, use] = (getCookie(c, STATE_COOKIE) ?? '').split('.');
		// A switch back from a custom token starts in Settings, while you are signed in: its errors
		// go there (the sign-in page would send a signed-in user on to the inbox).
		const fail = (message: string) =>
			c.redirect(
				use === 'app'
					? `${c.env.APP_URL}/settings/general?token_error=${encodeURIComponent(message)}#token`
					: `${c.env.APP_URL}/login?error=${encodeURIComponent(message)}`
			);
		deleteCookie(c, STATE_COOKIE, { path: '/api/auth' });
		if (c.req.query('error'))
			return fail(c.req.query('error_description') ?? 'The sign-in was cancelled.');
		if (!state || state !== c.req.query('state'))
			return fail('The sign-in link expired. Try again.');

		const res = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'User-Agent': 'hush'
			},
			body: JSON.stringify({
				client_id: c.env.GITHUB_CLIENT_ID,
				client_secret: c.env.GITHUB_CLIENT_SECRET,
				code: c.req.query('code'),
				redirect_uri: callbackUrl(c.env)
			})
		});
		const data = (await res.json().catch(() => ({}))) as {
			access_token?: string;
			error_description?: string;
		};
		if (!data.access_token) return fail(data.error_description ?? 'GitHub did not sign you in.');
		const token = data.access_token;
		const viewer = await inspect(token);
		if ('error' in viewer) return fail(viewer.error);

		// Your own token stays in use, unless you asked for the app's token again.
		const existing = await getUser(c.env, viewer.user.id);
		const keepOwn = existing?.token_source === 'own' && use !== 'app';
		await saveUser(
			c.env,
			viewer.user,
			keepOwn ? null : { value: token, scopes: viewer.scopes, source: 'app' },
			token
		);
		await startSession(c, viewer.user.id);
		await poller(c.env, viewer.user.id).start(viewer.user.id, c.env.APP_URL);
		// The app then runs the org access check once, unless this browser said "Don't show again".
		return c.redirect(
			use === 'app'
				? `${c.env.APP_URL}/settings/general?signed_in=1#token`
				: `${c.env.APP_URL}/inbox?signed_in=1`
		);
	})
	/**
	 * Use your own token in place of the app's: for an org that has not approved Hush, or one that
	 * allows only some apps. It must be a token for the same GitHub account.
	 */
	.put('/api/account/token', json<{ token: string }>(), async (c) => {
		const u = c.get('user');
		const token = c.req.valid('json').token?.trim();
		if (!token || token.length < 20) return c.json({ error: 'Paste a GitHub token.' }, 400);
		const viewer = await inspect(token);
		if ('error' in viewer) return c.json({ error: viewer.error }, 400);
		if (viewer.user.id !== u.id)
			return c.json(
				{ error: `This token is for @${viewer.user.login}. Add a token for @${u.login}.` },
				400
			);
		await saveUser(c.env, viewer.user, { value: token, scopes: viewer.scopes, source: 'own' });
		// Sync again: the new token can see threads the old one could not.
		await poller(c.env, u.id).start(u.id, new URL(c.req.url).origin);
		return c.json({ ok: true });
	})
	.post('/api/auth/logout', async (c) => {
		const sid = getCookie(c, SESSION_COOKIE);
		if (sid)
			await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?')
				.bind(await sha256(sid))
				.run();
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	})
	.delete('/api/account', async (c) => {
		const u = c.get('user');
		await poller(c.env, u.id).stop();
		await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	})
	/**
	 * The orgs your GitHub sign-in can see (Settings → GitHub access, and the note after sign-in).
	 * GitHub omits orgs that have not approved Hush, so this is only what Hush sees.
	 */
	.get('/api/account/orgs', async (c) => {
		const token = await appToken(c.env, c.get('user'));
		if (!token) return c.json({ available: false } satisfies OrgAccess);
		const res = await gh(token, '/user/orgs?per_page=100');
		if (!res.ok) return c.json({ error: `GitHub returned ${res.status} for your orgs.` }, 502);
		const orgs = ((await res.json()) as { login: string }[]).map((o) => o.login);
		return c.json({
			available: true,
			orgs,
			approveUrl: `https://github.com/settings/connections/applications/${c.env.GITHUB_CLIENT_ID}`
		} satisfies OrgAccess);
	})
	.get('/api/me', async (c) => {
		const u = c.get('user');
		const { settings, status } = await poller(c.env, u.id).me();
		const me: MeDTO = {
			login: u.login,
			name: u.name,
			avatarUrl: u.avatar_url,
			settings,
			lastPollAt: status.lastPollAt,
			nextPollAt: status.nextPollAt,
			lastPollError: status.lastError,
			ssoHiddenOrgs: status.ssoHiddenOrgs ?? 0,
			scopes: u.scopes ? u.scopes.split(',') : [],
			tokenSource: u.token_source
		};
		return c.json(me);
	});

export default app;
