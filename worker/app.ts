import { Hono, type Context } from 'hono';
import { validator } from 'hono/validator';
import type { Env, UserRow } from './db';

export const SESSION_COOKIE = 'hush_sid';

/** The signed-in user, and the hash of this browser's session id (sessions.id_hash). */
export type Vars = { user: UserRow; session: string };
export type AppEnv = { Bindings: Env; Variables: Vars };
export type Ctx = Context<AppEnv>;

/** A route group; index.ts mounts each one on the main app, after the middleware. */
export const routes = () => new Hono<AppEnv>();

export const poller = (env: Env, userId: number) =>
	env.POLLER.get(env.POLLER.idFromName(String(userId)));

/** Approximate, per-location limits against floods. Missing bindings (tests, old config) skip. */
export async function overLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
	if (!limiter) return false;
	const { success } = await limiter.limit({ key });
	return !success;
}
export const clientIp = (c: Context) => c.req.header('CF-Connecting-IP') ?? 'unknown';
export const tooMany = (c: Context) =>
	c.json({ error: 'Too many requests. Wait a minute and try again.' }, 429, {
		'Retry-After': '60'
	});

/**
 * The JSON body a route takes, for the typed client (src/lib/api.ts). It declares the type only:
 * the route still checks every value, because a request can hold anything. A missing body is {}.
 */
export const json = <T extends object>() => validator('json', (v) => v as Partial<T>);
/** The query parameters a route takes (type only, as for `json`). */
export const query = <T extends Record<string, string>>() =>
	validator('query', (v) => v as Partial<T>);
