import { generateKeyPairSync, verify } from 'node:crypto';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', async (original) => ({
	...(await original<typeof import('../db')>()),
	appToken: vi.fn(async () => 'user-token'),
	userToken: vi.fn(async () => 'user-token')
}));

const { appJwt, appInstallations, forgetInstallations, INSTALLATIONS_TTL_MS } =
	await import('../github-app');
const { default: webhooks } = await import('../routes/webhooks');

const NOW = Date.UTC(2026, 9, 22, 12);
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const appEnv = (over: Partial<Env> = {}) =>
	({
		GITHUB_APP_ID: '5432549',
		GITHUB_APP_SLUG: 'hush-gh',
		GITHUB_APP_PRIVATE_KEY: privateKey,
		GITHUB_WEBHOOK_SECRET: 'secret',
		...over
	}) as unknown as Env;

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('appJwt', () => {
	it('signs an RS256 token for the app that GitHub accepts for ten minutes at most', async () => {
		const jwt = await appJwt(appEnv(), NOW);
		const [header, payload, signature] = jwt.split('.');
		expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
		const claims = decode(payload);
		expect(claims.iss).toBe('5432549');
		expect(claims.iat).toBeLessThan(NOW / 1000);
		expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
		const signed = Buffer.from(`${header}.${payload}`);
		expect(verify('RSA-SHA256', signed, publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
	});

	it('reads a key written on one line with \\n, as in .dev.vars', async () => {
		const oneLine = privateKey.replace(/\n/g, '\\n');
		const [header, payload, signature] = (
			await appJwt(appEnv({ GITHUB_APP_PRIVATE_KEY: oneLine }), NOW)
		).split('.');
		const signed = Buffer.from(`${header}.${payload}`);
		expect(verify('RSA-SHA256', signed, publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
	});
});

function github(installations: unknown[], orgs: unknown[] = []) {
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			calls.push(url);
			const body = url.includes('/app/installations') ? installations : orgs;
			return new Response(JSON.stringify(body), { status: 200 });
		})
	);
	return calls;
}

describe('appInstallations', () => {
	beforeEach(() => forgetInstallations());
	afterEach(() => vi.unstubAllGlobals());

	it('keeps the list for five minutes', async () => {
		const calls = github([
			{ id: 1, account: { id: 10 }, suspended_at: null, repository_selection: 'all' }
		]);
		expect(await appInstallations(appEnv(), NOW)).toEqual([
			{ id: 1, accountId: 10, suspended: false, selection: 'all' }
		]);
		await appInstallations(appEnv(), NOW + INSTALLATIONS_TTL_MS - 1);
		expect(calls).toHaveLength(1);
		await appInstallations(appEnv(), NOW + INSTALLATIONS_TTL_MS);
		expect(calls).toHaveLength(2);
	});
});

describe('allPages', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('follows the next links, so an installation on page two counts', async () => {
		forgetInstallations();
		const pages = [
			[{ id: 1, account: { id: 10 }, suspended_at: null, repository_selection: 'all' }],
			[{ id: 2, account: { id: 42 }, suspended_at: null, repository_selection: 'selected' }]
		];
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				calls.push(url);
				const second = url.includes('page=2');
				return new Response(JSON.stringify(pages[second ? 1 : 0]), {
					status: 200,
					headers: second
						? {}
						: { Link: '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"' }
				});
			})
		);
		const installations = await appInstallations(appEnv(), NOW);
		expect(installations.map((i) => i.accountId)).toEqual([10, 42]);
		expect(calls).toHaveLength(2);
	});
});

describe('allPages limit', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('refuses a list that goes on past the last page it reads', async () => {
		forgetInstallations();
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('[]', {
						status: 200,
						headers: { Link: '<https://api.github.com/app/installations?page=99>; rel="next"' }
					})
			)
		);
		await expect(appInstallations(appEnv(), NOW)).rejects.toThrow(/more than 10 pages/);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('[]', { status: 200 }))
		);
		expect(await appInstallations(appEnv(), NOW)).toEqual([]);
	});
});

describe('GET /api/account/webhooks', () => {
	beforeEach(() => forgetInstallations());
	afterEach(() => vi.unstubAllGlobals());

	function request(env: Env, path = '/api/account/webhooks') {
		const app = new Hono<AppEnv>();
		app.use('*', async (c, next) => {
			c.set('user', { id: 42, login: 'ian', token_source: 'app' } as UserRow);
			await next();
		});
		app.route('/', webhooks);
		return app.request(path, {}, env);
	}

	it('is unavailable without the app configuration', async () => {
		const res = await request(appEnv({ GITHUB_APP_ID: undefined }));
		expect(await res.json()).toEqual({ available: false });
	});

	it('lists your account and your orgs, with their install state and links', async () => {
		github(
			[
				{ id: 7, account: { id: 42 }, suspended_at: null, repository_selection: 'selected' },
				{
					id: 8,
					account: { id: 200 },
					suspended_at: '2026-10-01T00:00:00Z',
					repository_selection: 'all'
				}
			],
			[
				{ login: 'PostHog', id: 100 },
				{ login: 'sandbox-org', id: 200 }
			]
		);
		const res = await request(appEnv());
		expect(await res.json()).toEqual({
			available: true,
			accounts: [
				{
					login: 'ian',
					kind: 'user',
					state: 'installed',
					selection: 'selected',
					url: 'https://github.com/settings/installations/7'
				},
				{
					login: 'PostHog',
					kind: 'org',
					state: 'missing',
					selection: null,
					url: 'https://github.com/apps/hush-gh/installations/new/permissions?target_id=100'
				},
				{
					login: 'sandbox-org',
					kind: 'org',
					state: 'suspended',
					selection: 'all',
					url: 'https://github.com/organizations/sandbox-org/settings/installations/8'
				}
			]
		});
	});

	it('reads the installations again on refresh, after an install', async () => {
		const calls = github([]);
		await request(appEnv());
		await request(appEnv());
		await request(appEnv(), '/api/account/webhooks?refresh=1');
		expect(calls.filter((url) => url.includes('/app/installations'))).toHaveLength(2);
	});
});
