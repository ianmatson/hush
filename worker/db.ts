import type { Poller } from './poller';
export { parseSettings } from '../src/lib/shared/settings';
import { decryptSecret } from './crypto';

export interface Env {
	/** Global data only: users (identity and token), sessions, and feed tokens. Each user's own
	 *  data is in their Durable Object's SQLite (worker/poller/schema.ts). */
	DB: D1Database;
	POLLER: DurableObjectNamespace<Poller>;
	ASSETS: Fetcher;
	TOKEN_ENC_KEY: string;
	/** Sign in with GitHub: the OAuth app (the secret is a Worker secret). */
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	/** Where the app is served, for the OAuth callback (http://localhost:5173 in development). */
	APP_URL: string;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	/** Optional push contact (mailto: or https:). Defaults to the app's own URL. */
	VAPID_SUBJECT?: string;
	/** Comma-separated GitHub orgs whose members may use Hush. Empty = anyone with a token. */
	ALLOWED_ORGS?: string;
	// Rate limiters (optional, so tests and old configs still work).
	AUTH_LIMIT?: RateLimit;
	FEED_LIMIT?: RateLimit;
	API_LIMIT?: RateLimit;
}

export interface UserRow {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string | null;
	token_ct: string;
	token_iv: string;
	scopes: string;
	/** 'app': the token from Sign in with GitHub. 'own': a token the user added in Settings. */
	token_source: 'app' | 'own';
	access_checked_at: number | null;
}

export function getUser(env: Env, id: number) {
	return env.DB.prepare(
		'SELECT id, login, name, avatar_url, token_ct, token_iv, scopes, token_source, access_checked_at FROM users WHERE id = ?'
	)
		.bind(id)
		.first<UserRow>();
}

export function userToken(env: Env, u: UserRow): Promise<string> {
	return decryptSecret(u.token_ct, u.token_iv, env.TOKEN_ENC_KEY);
}
