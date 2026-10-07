import type { Poller } from './poller';
import type { DecisionModel } from './decide';
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
	/** "off" in a local test copy: Hush writes nothing to GitHub (no read, done, mute, or actions). */
	GITHUB_WRITES?: string;
	// Rate limiters (optional, so tests and old configs still work).
	AUTH_LIMIT?: RateLimit;
	FEED_LIMIT?: RateLimit;
	API_LIMIT?: RateLimit;
	AI?: DecisionModel;
	DECISIONS?: string;
	DECISION_MODEL?: string;
	DECISION_DAILY_TOKENS?: string;
	SLACK_CLIENT_ID?: string;
	SLACK_CLIENT_SECRET?: string;
	SLACK_SIGNING_SECRET?: string;
	SLACK_MENTIONS_CLIENT_ID?: string;
	SLACK_MENTIONS_CLIENT_SECRET?: string;
	SLACK_MENTIONS_TEAM_ID?: string;
	SLACK_MENTIONS_GITHUB_ORG?: string;
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
	/** The token from Sign in with GitHub, also while a custom token is in use (null before). */
	app_token_ct: string | null;
	app_token_iv: string | null;
}

export function getUser(env: Env, id: number) {
	return env.DB.prepare(
		'SELECT id, login, name, avatar_url, token_ct, token_iv, scopes, token_source, app_token_ct, app_token_iv FROM users WHERE id = ?'
	)
		.bind(id)
		.first<UserRow>();
}

/** What each stored token is bound to (see encryptSecret): the user, and the column. */
export const tokenContext = (userId: number, which: 'token' | 'app_token') =>
	`user:${userId}:${which}`;

export function userToken(env: Env, u: UserRow): Promise<string> {
	return decryptSecret(u.token_ct, u.token_iv, env.TOKEN_ENC_KEY, tokenContext(u.id, 'token'));
}

/** The token from Sign in with GitHub, or null (signed in before it was kept). */
export function appToken(env: Env, u: UserRow): Promise<string | null> {
	if (u.app_token_ct && u.app_token_iv)
		return decryptSecret(
			u.app_token_ct,
			u.app_token_iv,
			env.TOKEN_ENC_KEY,
			tokenContext(u.id, 'app_token')
		);
	return Promise.resolve(u.token_source === 'app' ? userToken(env, u) : null);
}
