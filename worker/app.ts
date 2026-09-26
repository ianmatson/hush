import { Hono, type Context } from 'hono';
import type { Env, UserRow } from './db';

export const SESSION_COOKIE = 'hush_sid';
export const SESSION_DAYS = 30;

export type Vars = { user: UserRow };
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
