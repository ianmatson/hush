import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { MeDTO } from '../../src/lib/shared/types';
import { allowedOrgs, checkAccess } from '../access';
import { encryptSecret, randomToken, sha256 } from '../crypto';
import { getUser, userToken, type Env } from '../db';
import { getViewer, type GhUser } from '../github';
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

/** Save the user's GitHub profile, and a token when there is one to store. */
async function saveUser(
	env: Env,
	user: GhUser,
	token: { value: string; scopes: string[]; source: 'app' | 'own' } | null
) {
	const now = Date.now();
	if (!token) {
		await env.DB.prepare(
			'UPDATE users SET login = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?'
		)
			.bind(user.login, user.name, user.avatar_url, now, user.id)
			.run();
		return;
	}
	const { ct, iv } = await encryptSecret(token.value, env.TOKEN_ENC_KEY);
	await env.DB.prepare(
		`INSERT INTO users (id, login, name, avatar_url, token_ct, token_iv, scopes, token_source, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
     ON CONFLICT (id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url,
       token_ct = excluded.token_ct, token_iv = excluded.token_iv, scopes = excluded.scopes,
       token_source = excluded.token_source, updated_at = excluded.updated_at,
       access_checked_at = excluded.updated_at`
	)
		.bind(
			user.id,
			user.login,
			user.name,
			user.avatar_url,
			ct,
			iv,
			token.scopes.join(','),
			token.source,
			now
		)
		.run();
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
		const fail = (message: string) =>
			c.redirect(`${c.env.APP_URL}/login?error=${encodeURIComponent(message)}`);
		const [state, use] = (getCookie(c, STATE_COOKIE) ?? '').split('.');
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
		const orgs = allowedOrgs(c.env);
		let access = await checkAccess(token, orgs);
		// An org that has not approved the app hides your membership from its token: then your own
		// token decides.
		if (!access.ok && access.reason === 'error' && keepOwn)
			access = await checkAccess(await userToken(c.env, existing), orgs);
		if (!access.ok)
			return fail(
				access.reason === 'error'
					? `${access.message} If your org has not approved Hush yet, ask an owner to approve it on GitHub.`
					: access.message
			);

		await saveUser(
			c.env,
			viewer.user,
			keepOwn ? null : { value: token, scopes: viewer.scopes, source: 'app' }
		);
		await startSession(c, viewer.user.id);
		await poller(c.env, viewer.user.id).start(viewer.user.id, c.env.APP_URL);
		return c.redirect(`${c.env.APP_URL}/inbox`);
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
		const access = await checkAccess(token, allowedOrgs(c.env));
		if (!access.ok) return c.json({ error: access.message }, 403);
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
