import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { MeDTO } from '../../src/lib/shared/types';
import { allowedOrgs, checkAccess } from '../access';
import { encryptSecret, randomToken, sha256 } from '../crypto';
import { parseSettings } from '../db';
import { getViewer } from '../github';
import { routes, SESSION_COOKIE, SESSION_DAYS, poller, json } from '../app';

// --- Auth -------------------------------------------------------------------

const app = routes()
	.post('/api/auth/login', json<{ token: string }>(), async (c) => {
		const { token } = c.req.valid('json');
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

export default app;
