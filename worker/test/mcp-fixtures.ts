import { vi } from 'vitest';
import type { Env } from '../db';
import { sha256 } from '../crypto';
import type { McpAuthorization } from '../assistant/oauth';
import type { SnapshotPrincipal } from '../assistant/snapshot';
import type { McpConsentDTO } from '../../src/lib/shared/mcp';
import type { Settings } from '../../src/lib/shared/types';
import { assistantFixture } from './assistant-fixtures';

export const ORIGIN = 'https://app.example.test';
export const RESOURCE = `${ORIGIN}/mcp`;
export const REDIRECT = 'https://client.example.test/callback';
export const VERIFIER = 'a'.repeat(64);

export function memoryStorage() {
	const values = new Map<string, unknown>();
	const writes = vi.fn();
	const storage = {
		get: vi.fn(async (key: string) => structuredClone(values.get(key))),
		put: vi.fn(async (key: string, value: unknown) => {
			writes();
			values.set(key, structuredClone(value));
		}),
		delete: vi.fn(async (key: string) => {
			writes();
			return values.delete(key);
		}),
		list: vi.fn(
			async (options: { prefix?: string; startAfter?: string; limit?: number } = {}) =>
				new Map(
					[...values]
						.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
						.filter(
							([key]) =>
								key.startsWith(options.prefix ?? '') &&
								(!options.startAfter || key > options.startAfter)
						)
						.slice(0, options.limit ?? Infinity)
						.map(([key, value]) => [key, structuredClone(value)])
				)
		),
		setAlarm: vi.fn(() => {
			throw new Error('Unexpected alarm');
		}),
		deleteAlarm: vi.fn(() => {
			throw new Error('Unexpected alarm');
		})
	} as unknown as DurableObjectStorage;
	return { storage, values, writes };
}

export async function mcpFixture(Authorization: typeof McpAuthorization) {
	const f = assistantFixture();
	f.values.set('mcpAccessVersion', 'existing-random-epoch');
	const store = memoryStorage();
	const user = { id: 1, login: 'reviewer' };
	const sid = 'synthetic-browser-session';
	const session = await sha256(sid);
	const statements: string[] = [];
	const DB = {
		prepare: (sql: string) => {
			statements.push(sql);
			if (!sql.startsWith('SELECT ')) throw new Error('Unexpected database write');
			return {
				bind: (...args: unknown[]) => ({
					first: async () => {
						if (sql.includes('FROM sessions')) return args[0] === session ? user : null;
						return args[0] === user.id ? user : null;
					}
				})
			};
		}
	};
	const env = {
		APP_URL: ORIGIN,
		DB,
		WORKSPACE: {
			idFromName: (id: string) => id,
			get: (id: string) => ({
				savedViewsSnapshot: async (principal: SnapshotPrincipal) => {
					if (id !== String(principal.userId)) throw new Error('Wrong storage');
					return f.workspace.savedViewsSnapshot(principal);
				}
			})
		},
		ASSETS: { fetch: async () => new Response('synthetic assets') }
	} as unknown as Env;
	const auth = new Authorization(
		{ storage: store.storage, waitUntil: () => {} } as unknown as DurableObjectState,
		env
	);
	env.MCP_AUTH = { idFromName: () => 'auth', get: () => auth } as unknown as Env['MCP_AUTH'];
	let delivered: Promise<unknown> = Promise.resolve();
	const writer = {
		updateSettings: (body: Partial<Settings>, replace?: boolean) => {
			const next = delivered.then(() => f.workspace.updateSettings(body, replace));
			delivered = next.catch(() => undefined);
			return next;
		}
	};
	const principal = { userId: 1, login: 'reviewer', session };
	const register = async (overrides = {}) => {
		const response = await auth.protocol(
			new Request(`${ORIGIN}/oauth/register`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					client_name: 'Synthetic app',
					redirect_uris: [REDIRECT],
					token_endpoint_auth_method: 'none',
					grant_types: ['authorization_code', 'refresh_token'],
					response_types: ['code'],
					...overrides
				})
			})
		);
		return { response, client: (await response.json()) as { client_id: string } };
	};
	const begin = async (clientId: string, overrides: Record<string, string> = {}) => {
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: clientId,
			redirect_uri: REDIRECT,
			scope: 'saved-views:read',
			resource: RESOURCE,
			state: 'synthetic-state',
			code_challenge: await sha256(VERIFIER),
			code_challenge_method: 'S256',
			...overrides
		});
		const response = await auth.begin(
			new Request(`${ORIGIN}/oauth/authorize?${params}`),
			principal
		);
		const location = response.headers.get('Location');
		const id = location ? new URL(location).searchParams.get('request')! : '';
		const cookie = response.headers.get('Set-Cookie')?.split(';')[0] ?? '';
		const consent = id ? ((await auth.consent(id, principal)) as McpConsentDTO) : null;
		return { response, id, cookie, consent };
	};
	const decide = async (
		pending: Awaited<ReturnType<typeof begin>>,
		changes = {},
		cookie = pending.cookie
	) =>
		auth.decide(
			new Request(`${ORIGIN}/api/mcp/consent`, {
				method: 'POST',
				headers: { Cookie: cookie, Origin: ORIGIN }
			}),
			principal,
			{
				requestId: pending.id,
				csrfToken: pending.consent!.csrfToken,
				decision: 'allow',
				viewIds: ['mine'],
				...changes
			}
		);
	const exchange = async (clientId: string, code: string, changes: Record<string, string> = {}) =>
		auth.protocol(
			new Request(`${ORIGIN}/oauth/token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					client_id: clientId,
					code,
					redirect_uri: REDIRECT,
					code_verifier: VERIFIER,
					resource: RESOURCE,
					...changes
				})
			})
		);
	const connect = async () => {
		const { client } = await register();
		const pending = await begin(client.client_id);
		const response = await decide(pending);
		const { redirectTo } = (await response.json()) as { redirectTo: string };
		const code = new URL(redirectTo).searchParams.get('code')!;
		const tokenResponse = await exchange(client.client_id, code);
		const tokens = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token: string;
			expires_in: number;
		};
		if (tokenResponse.status !== 200) throw new Error(JSON.stringify(tokens));
		return { client, pending, code, tokens };
	};
	return {
		...f,
		store,
		env,
		auth,
		principal,
		sid,
		statements,
		register,
		begin,
		decide,
		exchange,
		connect,
		writer
	};
}
