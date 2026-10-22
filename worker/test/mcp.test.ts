import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../db';
import { mcpFixture, ORIGIN, REDIRECT, RESOURCE, VERIFIER } from './mcp-fixtures';
import { NOW } from './assistant-fixtures';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { Settings } from '../../src/lib/shared/types';
import type { AccessGrant } from '../assistant/oauth';

vi.mock('cloudflare:workers', () => ({
	WorkerEntrypoint: class {},
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: Env
		) {}
	}
}));

const { McpAuthorization } = await import('../assistant/oauth');
const { default: app } = await import('../index');

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('MCP OAuth and passive transport', () => {
	const refresh = (f: Awaited<ReturnType<typeof mcpFixture>>, clientId: string, token: string) =>
		f.auth.protocol(
			new Request(`${ORIGIN}/oauth/token`, {
				method: 'POST',
				body: new URLSearchParams({
					grant_type: 'refresh_token',
					refresh_token: token,
					client_id: clientId,
					resource: RESOURCE
				})
			})
		);

	async function tool(f: Awaited<ReturnType<typeof mcpFixture>>, token: string, name: string) {
		const response = await app.request(
			RESOURCE,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
					'Mcp-Protocol-Version': '2026-07-28',
					'Mcp-Method': 'tools/call',
					'Mcp-Name': name
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: {
						name,
						arguments: name === 'get_view' ? { view_id: 'mine' } : {},
						_meta: {
							'io.modelcontextprotocol/protocolVersion': '2026-07-28',
							'io.modelcontextprotocol/clientInfo': { name: 'synthetic', version: '1' },
							'io.modelcontextprotocol/clientCapabilities': {}
						}
					}
				})
			},
			f.env
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			result: { structuredContent: { ok: boolean; data: { total?: number; totalItems?: number } } };
		};
		expect(body.result.structuredContent.ok).toBe(true);
		return body.result.structuredContent.data;
	}

	it('keeps grants usable after harmless saves and silent rotating refresh at 16 minutes and 24 hours', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client, tokens } = await f.connect();
		const epoch = f.values.get('mcpAccessVersion');
		for (const patch of [
			{},
			{ pushWhileOpen: true },
			{
				views: [
					{
						...f.settings.views[0],
						name: 'Renamed',
						groupBy: 'repo',
						sort: { by: 'title', dir: 'asc', turnFirst: false },
						pushNew: true
					}
				]
			}
		] satisfies Partial<Settings>[]) {
			expect(await f.writer.updateSettings(patch)).toHaveProperty('settings');
			expect(f.values.get('mcpAccessVersion')).toBe(epoch);
			expect((await tool(f, tokens.access_token, 'list_views')).total).toBe(1);
			expect((await tool(f, tokens.access_token, 'get_view')).totalItems).toBe(3);
		}
		const before = JSON.stringify([...f.values]);
		const oauthWrites = f.store.writes.mock.calls.length;
		await tool(f, tokens.access_token, 'get_view');
		expect(JSON.stringify([...f.values])).toBe(before);
		expect(f.store.writes).toHaveBeenCalledTimes(oauthWrites);
		vi.setSystemTime(NOW + 16 * 60_000);
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
		const first = await refresh(f, client.client_id, tokens.refresh_token);
		expect(first.status).toBe(200);
		const rotated = (await first.json()) as typeof tokens;
		expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
		expect(rotated.expires_in).toBe(900);
		await tool(f, rotated.access_token, 'list_views');
		expect((await tool(f, rotated.access_token, 'get_view')).totalItems).toBe(3);
		vi.setSystemTime(NOW + 24 * 3600_000);
		const second = await refresh(f, client.client_id, rotated.refresh_token);
		expect(second.status).toBe(200);
		const daily = (await second.json()) as typeof tokens;
		expect(daily.refresh_token).not.toBe(rotated.refresh_token);
		await tool(f, daily.access_token, 'list_views');
		expect((await tool(f, daily.access_token, 'get_view')).totalItems).toBe(3);
		expect((await refresh(f, client.client_id, tokens.refresh_token)).status).toBe(400);
		vi.setSystemTime(NOW + 16 * 24 * 3600_000);
		const renewed = await refresh(f, client.client_id, daily.refresh_token);
		expect(renewed.status).toBe(200);
		const later = (await renewed.json()) as typeof tokens;
		vi.setSystemTime(NOW + 30 * 24 * 3600_000);
		expect((await refresh(f, client.client_id, later.refresh_token)).status).toBe(400);
		expect(await f.auth.validate(daily.access_token)).toBeNull();
	});

	it.each([
		'search',
		'closed',
		'custom',
		'project',
		'category',
		'bots',
		'drafts',
		'teams',
		'category-name',
		'category-description',
		'category-rule'
	])('denies refresh and data after authorization-sensitive %s changes', async (change) => {
		const f = await mcpFixture(McpAuthorization);
		if (change.startsWith('category-')) {
			f.settings.views[0].groupBy = 'category:effort';
			f.saveSettings();
		}
		const { client, tokens } = await f.connect();
		const settings = structuredClone(f.settings);
		const view = settings.views[0];
		if (change === 'search') view.searches = ['repo:sandbox/other'];
		if (change === 'closed') view.keepClosed = false;
		if (change === 'custom')
			Object.assign(view, {
				groupBy: 'custom',
				sections: [{ name: 'Private fact', rule: 'author:@me' }]
			});
		if (change === 'project') view.groupBy = 'project:secret/7';
		if (change === 'category') view.groupBy = 'category:effort';
		if (change === 'bots') settings.dash.hideBots = false;
		if (change === 'drafts') settings.dash.hideOthersDrafts = false;
		if (change === 'teams') settings.dash.excludedTeams = ['org/team'];
		if (change.startsWith('category-'))
			Object.assign(settings.categoryGroups[0].categories[0], {
				[change.slice('category-'.length)]: change === 'category-rule' ? 'author:@me' : 'Changed'
			});
		expect(await f.writer.updateSettings(settings)).toHaveProperty('settings');
		expect(f.values.get('mcpAccessVersion')).not.toBe('existing-random-epoch');
		const denied = await refresh(f, client.client_id, tokens.refresh_token);
		expect(denied.status).toBe(400);
		expect(await denied.json()).toHaveProperty('error', 'invalid_grant');
		expect(
			(
				await app.request(
					RESOURCE,
					{ method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}` } },
					f.env
				)
			).status
		).toBe(401);
	});

	it('keeps the epoch account-wide when a sensitive change affects an ungranted view', async () => {
		const f = await mcpFixture(McpAuthorization);
		f.settings.views.push({ ...f.settings.views[0], id: 'ungranted' });
		f.saveSettings();
		const { client, tokens } = await f.connect();
		await f.writer.updateSettings({
			views: [f.settings.views[0], { ...f.settings.views[1], searches: ['repo:sandbox/other'] }]
		});
		expect((await refresh(f, client.client_id, tokens.refresh_token)).status).toBe(400);
	});

	it('preserves cached granted data when saved views only change order', async () => {
		const f = await mcpFixture(McpAuthorization);
		f.settings.views.push({ ...f.settings.views[0], id: 'ungranted' });
		f.saveSettings();
		const { client, tokens } = await f.connect();
		await f.writer.updateSettings({ views: [...f.settings.views].reverse() });
		expect((await tool(f, tokens.access_token, 'list_views')).total).toBe(1);
		expect((await tool(f, tokens.access_token, 'get_view')).totalItems).toBe(3);
		expect((await refresh(f, client.client_id, tokens.refresh_token)).status).toBe(200);
	});

	it('does not resurrect grants after deletion and identical view-ID recreation', async () => {
		const f = await mcpFixture(McpAuthorization);
		f.settings.views.push({ ...f.settings.views[0], id: 'other' });
		f.saveSettings();
		const { client, tokens } = await f.connect();
		await f.writer.updateSettings({});
		await f.writer.updateSettings({ views: [f.settings.views[1]] });
		await f.writer.updateSettings({ views: f.settings.views });
		expect((await refresh(f, client.client_id, tokens.refresh_token)).status).toBe(400);
	});

	it('keeps the access epoch coherent across concurrent edits and failed writes', async () => {
		const f = await mcpFixture(McpAuthorization);
		await Promise.all(
			['First', 'Second'].map((name) =>
				f.writer.updateSettings({ views: [{ ...f.settings.views[0], name }] })
			)
		);
		expect(f.values.get('mcpAccessVersion')).toBe('existing-random-epoch');
		const before = JSON.stringify([...f.values]);
		const settingsBefore = f.storedSettings();
		f.settingsWrites.mockImplementationOnce(() => {
			throw new Error('Synthetic write failure');
		});
		await expect(
			f.writer.updateSettings({
				views: [{ ...f.settings.views[0], searches: ['repo:sandbox/other'] }]
			})
		).rejects.toThrow('Synthetic write failure');
		expect(JSON.stringify([...f.values])).toBe(before);
		expect(f.storedSettings()).toEqual(settingsBefore);
		await Promise.all([
			f.writer.updateSettings({
				views: [{ ...f.settings.views[0], searches: ['repo:sandbox/other'] }]
			}),
			f.writer.updateSettings({ views: [{ ...f.settings.views[0], name: 'Third' }] })
		]);
		expect(f.values.get('mcpAccessVersion')).not.toBe('existing-random-epoch');
		expect(f.storedSettings().views[0].name).toBe('Third');
	});

	it('replaces a missing legacy-initial epoch on a default save and never reuses it after reset', async () => {
		const f = await mcpFixture(McpAuthorization);
		Object.assign(f.settings, structuredClone(DEFAULT_SETTINGS));
		f.saveSettings();
		f.values.delete('mcpAccessVersion');
		const { client, tokens } = await f.connect();
		const key = [...f.store.values.keys()].find((key) => key.startsWith('access:'))!;
		const grant = f.store.values.get(key) as AccessGrant;
		expect(grant.accessVersion).toBe('initial');
		await f.writer.updateSettings({});
		const first = f.values.get('mcpAccessVersion');
		expect(first).not.toBe('initial');
		expect((await refresh(f, client.client_id, tokens.refresh_token)).status).toBe(400);
		f.values.clear();
		await f.writer.updateSettings({});
		expect(f.values.get('mcpAccessVersion')).not.toBe('initial');
		expect(f.values.get('mcpAccessVersion')).not.toBe(first);
	});

	it('publishes discovery and registration grants no data or browser authority', async () => {
		const f = await mcpFixture(McpAuthorization);
		const metadata = await app.request(
			`${ORIGIN}/.well-known/oauth-authorization-server`,
			{},
			f.env
		);
		expect(await metadata.json()).toMatchObject({
			issuer: ORIGIN,
			token_endpoint: `${ORIGIN}/oauth/token`,
			revocation_endpoint: `${ORIGIN}/oauth/token`,
			code_challenge_methods_supported: ['S256']
		});
		const resource = await app.request(
			`${ORIGIN}/.well-known/oauth-protected-resource/mcp`,
			{},
			f.env
		);
		expect(await resource.json()).toMatchObject({
			resource: RESOURCE,
			scopes_supported: ['saved-views:read']
		});
		const { response, client } = await f.register();
		expect(response.status).toBe(201);
		expect(await f.auth.grants(f.principal)).toEqual([]);
		for (const header of ['', `Bearer ${client.client_id}`, `Bearer ${f.sid}`]) {
			const denied = await app.request(
				RESOURCE,
				{ method: 'POST', headers: { Authorization: header, Cookie: `hush_sid=${f.sid}` } },
				f.env
			);
			expect(denied.status).toBe(401);
			expect(denied.headers.get('WWW-Authenticate')).toContain(
				'/.well-known/oauth-protected-resource/mcp'
			);
		}
	});

	it.each([
		{ redirect_uri: 'https://attacker.example.test/callback' },
		{ redirect_uri: `${REDIRECT}/extra` },
		{ code_challenge_method: 'plain' },
		{ code_challenge: '' },
		{ scope: 'repo' },
		{ scope: '' },
		{ resource: `${ORIGIN}/other` },
		{ resource: '' }
	])('refuses invalid authorization request %j without creating a grant', async (changes) => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		expect((await f.begin(client.client_id, changes)).response.status).toBe(400);
		expect(await f.auth.grants(f.principal)).toEqual([]);
	});

	it('refuses unsafe redirects and confidential registration and never fetches CIMD', async () => {
		const f = await mcpFixture(McpAuthorization);
		for (const redirect of [
			'https://ok.example/cb#fragment',
			'https://user:pass@ok.example/cb',
			'http://remote.example/cb',
			'javascript:alert(1)'
		])
			expect((await f.register({ redirect_uris: [redirect] })).response.status).toBe(400);
		expect(
			(await f.register({ token_endpoint_auth_method: 'client_secret_post' })).response.status
		).toBe(400);
		const network = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValue(new Error('Unexpected network'));
		expect((await f.begin('https://untrusted.example/client.json')).response.status).toBe(400);
		expect(network).not.toHaveBeenCalled();
	});

	it('binds consent to account, session, CSRF, browser cookie, chosen views and a single use', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		const pending = await f.begin(client.client_id);
		expect(await f.auth.consent(pending.id, { ...f.principal, userId: 2 })).toHaveProperty('error');
		expect(await f.auth.consent(pending.id, { ...f.principal, session: 'another' })).toHaveProperty(
			'error'
		);
		for (const changes of [
			{ csrfToken: 'wrong' },
			{ viewIds: ['excluded'] },
			{ viewIds: [] },
			{ decision: 'invalid' }
		])
			expect((await f.decide(pending, changes)).status).toBe(400);
		expect((await f.decide(pending, {}, '')).status).toBe(400);
		const allowed = await f.decide(pending);
		expect(allowed.status).toBe(200);
		expect((await f.decide(pending)).status).toBe(400);
		const grants = await f.auth.grants(f.principal);
		expect(grants).toHaveLength(1);
		expect(grants[0].views).toEqual([{ id: 'mine', name: 'Mine' }]);
		expect(await f.auth.grants({ ...f.principal, userId: 2 })).toEqual([]);
	});

	it('denial returns the validated client state and never creates access', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		const pending = await f.begin(client.client_id);
		const response = await f.decide(pending, { decision: 'deny' });
		const redirect = new URL(((await response.json()) as { redirectTo: string }).redirectTo);
		expect(redirect.origin).toBe(new URL(REDIRECT).origin);
		expect(redirect.searchParams.get('error')).toBe('access_denied');
		expect(redirect.searchParams.get('state')).toBe('synthetic-state');
		expect(await f.auth.grants(f.principal)).toEqual([]);
	});

	it.each([
		{ code_verifier: 'b'.repeat(64) },
		{ redirect_uri: 'https://bad.example/cb' },
		{ resource: '' },
		{ resource: `${ORIGIN}/other` }
	])('rejects invalid code exchange %j', async (changes) => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		const pending = await f.begin(client.client_id);
		const allowed = await f.decide(pending);
		const code = new URL(
			((await allowed.json()) as { redirectTo: string }).redirectTo
		).searchParams.get('code')!;
		expect((await f.exchange(client.client_id, code, changes)).status).toBe(400);
	});

	it('serializes concurrent code exchange and rejects replay after a cold restart', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		const pending = await f.begin(client.client_id);
		const allowed = await f.decide(pending);
		const code = new URL(
			((await allowed.json()) as { redirectTo: string }).redirectTo
		).searchParams.get('code')!;
		const responses = await Promise.all([
			f.exchange(client.client_id, code),
			f.exchange(client.client_id, code)
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
		const cold = new McpAuthorization({ storage: f.store.storage } as DurableObjectState, f.env);
		const response = await cold.protocol(
			new Request(`${ORIGIN}/oauth/token`, {
				method: 'POST',
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					client_id: client.client_id,
					code,
					redirect_uri: REDIRECT,
					code_verifier: VERIFIER,
					resource: RESOURCE
				})
			})
		);
		expect(response.status).toBe(400);
	});

	it('reads through the real SDK without writes, cookie authentication, or network', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { tokens } = await f.connect();
		const before = JSON.stringify([...f.store.values]);
		const writeCount = f.store.writes.mock.calls.length;
		const network = vi
			.spyOn(globalThis, 'fetch')
			.mockRejectedValue(new Error('Unexpected network'));
		for (const method of ['initialize', 'tools/list', 'tools/call']) {
			const params =
				method === 'initialize'
					? {
							protocolVersion: '2025-11-25',
							capabilities: {},
							clientInfo: { name: 'synthetic', version: '1' }
						}
					: method === 'tools/call'
						? { name: 'get_view', arguments: { view_id: 'mine' } }
						: {};
			const response = await app.request(
				RESOURCE,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${tokens.access_token}`,
						'Content-Type': 'application/json',
						Accept: 'application/json, text/event-stream',
						'MCP-Protocol-Version': '2025-11-25'
					},
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
				},
				f.env
			);
			expect(response.status).toBe(200);
			const body = await response.text();
			const result = JSON.parse(
				body.startsWith('event:')
					? body
							.split('\n')
							.find((line) => line.startsWith('data: '))!
							.slice(6)
					: body
			) as { result?: unknown; error?: unknown };
			expect(result.error).toBeUndefined();
			expect(result.result).toBeDefined();
		}
		expect(JSON.stringify([...f.store.values])).toBe(before);
		expect(f.store.writes).toHaveBeenCalledTimes(writeCount);
		expect(f.writes).not.toHaveBeenCalled();
		expect(network).not.toHaveBeenCalled();
		expect(f.statements.every((sql) => sql.startsWith('SELECT '))).toBe(true);
	});

	it('revokes only the current user grant and destroys its provider family', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client, tokens } = await f.connect();
		const grant = (await f.auth.grants(f.principal))[0];
		await f.auth.revoke(2, grant.id);
		expect(await f.auth.validate(tokens.access_token)).not.toBeNull();
		await f.auth.revoke(1, grant.id);
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
		expect(
			[...f.store.values.keys()].some(
				(key) => key.startsWith('oauth:grant:') || key.startsWith('oauth:token:')
			)
		).toBe(false);
		const refresh = await f.auth.protocol(
			new Request(`${ORIGIN}/oauth/token`, {
				method: 'POST',
				body: new URLSearchParams({
					grant_type: 'refresh_token',
					refresh_token: tokens.refresh_token,
					client_id: client.client_id,
					resource: RESOURCE
				})
			})
		);
		expect(refresh.status).toBe(400);
	});

	it('serves the current protocol without a persistent session', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { tokens } = await f.connect();
		for (const method of ['server/discover', 'tools/list', 'tools/call']) {
			const params = {
				...(method === 'tools/call' ? { name: 'list_views', arguments: {} } : {}),
				_meta: {
					'io.modelcontextprotocol/protocolVersion': '2026-07-28',
					'io.modelcontextprotocol/clientInfo': { name: 'synthetic', version: '1' },
					'io.modelcontextprotocol/clientCapabilities': {}
				}
			};
			const response = await app.request(
				RESOURCE,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${tokens.access_token}`,
						'Content-Type': 'application/json',
						Accept: 'application/json, text/event-stream',
						'MCP-Protocol-Version': '2026-07-28',
						'Mcp-Method': method,
						...(method === 'tools/call' ? { 'Mcp-Name': 'list_views' } : {})
					},
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
				},
				f.env
			);
			expect(response.status, await response.clone().text()).toBe(200);
			const result = (await response.json()) as { error?: unknown; result?: unknown };
			expect(result.error).toBeUndefined();
			expect(result.result).toBeDefined();
			expect(response.headers.has('Mcp-Session-Id')).toBe(false);
		}
	});

	it('keeps data revoked and retries provider cleanup after a storage failure', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { tokens } = await f.connect();
		const grant = (await f.auth.grants(f.principal))[0];
		const remove = vi.mocked(f.store.storage.delete).getMockImplementation()!;
		let failed = false;
		vi.spyOn(f.store.storage, 'delete').mockImplementation(async (key: string | string[]) => {
			if (typeof key === 'string' && key.startsWith('oauth:grant:') && !failed) {
				failed = true;
				throw new Error('Synthetic storage failure');
			}
			return remove(key as string);
		});
		await expect(f.auth.revoke(1, grant.id)).rejects.toThrow('Synthetic storage failure');
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
		expect([...f.store.values.keys()].some((key) => key.startsWith('revocation:'))).toBe(true);
		await f.auth.revoke(1, grant.id);
		expect(
			[...f.store.values.keys()].some(
				(key) =>
					key.startsWith('revocation:') ||
					key.startsWith('oauth:grant:') ||
					key.startsWith('oauth:token:')
			)
		).toBe(false);
	});

	it('revokes every application grant before account removal', async () => {
		const f = await mcpFixture(McpAuthorization);
		const first = await f.connect();
		const second = await f.connect();
		await f.auth.revokeAll(1);
		expect(await f.auth.validate(first.tokens.access_token)).toBeNull();
		expect(await f.auth.validate(second.tokens.access_token)).toBeNull();
		expect(await f.auth.grants(f.principal)).toEqual([]);
	});

	it.each([
		{ audience: undefined },
		{ audience: 'https://other.example/mcp' },
		{ scope: [] },
		{ scope: ['repo'] },
		{ userId: '2' },
		{ expiresAt: NOW / 1000 - 1 }
	])('refuses tokens with invalid server-side binding %j', async (changes) => {
		const f = await mcpFixture(McpAuthorization);
		const { tokens } = await f.connect();
		const key = [...f.store.values.keys()].find((key) => key.startsWith('oauth:token:'))!;
		const record = f.store.values.get(key) as { value: string };
		record.value = JSON.stringify({ ...JSON.parse(record.value), ...changes });
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
	});

	it('refuses consent after expiry or settings changes and refresh after access-version changes', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { client } = await f.register();
		const pending = await f.begin(client.client_id);
		vi.setSystemTime(NOW + 10 * 60 * 1000);
		expect((await f.decide(pending)).status).toBe(400);
		vi.setSystemTime(NOW);
		const newer = await f.begin(client.client_id);
		f.values.set('mcpAccessVersion', 'changed');
		expect((await f.decide(newer)).status).toBe(400);
		const { client: connected, tokens } = await f.connect();
		f.values.set('mcpAccessVersion', 'changed-again');
		const refresh = await f.auth.protocol(
			new Request(`${ORIGIN}/oauth/token`, {
				method: 'POST',
				body: new URLSearchParams({
					grant_type: 'refresh_token',
					refresh_token: tokens.refresh_token,
					client_id: connected.client_id,
					resource: RESOURCE
				})
			})
		);
		expect(refresh.status).toBe(400);
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
	});

	it('fails closed after settings change, deletion/recreation, token expiry and removed provider grants', async () => {
		const f = await mcpFixture(McpAuthorization);
		const { tokens } = await f.connect();
		f.values.set('mcpAccessVersion', 'changed-and-recreated');
		const request = () =>
			app.request(
				RESOURCE,
				{ method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}` } },
				f.env
			);
		expect((await request()).status).toBe(401);
		f.values.delete('mcpAccessVersion');
		vi.setSystemTime(NOW + 15 * 60 * 1000);
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
		vi.setSystemTime(NOW);
		const key = [...f.store.values.keys()].find((key) => key.startsWith('oauth:grant:'))!;
		f.store.values.delete(key);
		expect(await f.auth.validate(tokens.access_token)).toBeNull();
	});

	it('returns expected consent errors across RPC as data and enforces management origin and CSRF', async () => {
		const f = await mcpFixture(McpAuthorization);
		const headers = {
			Cookie: `hush_sid=${f.sid}`,
			Origin: ORIGIN,
			'Content-Type': 'application/json'
		};
		expect(
			(await app.request(`${ORIGIN}/api/mcp/consent?request=missing`, { headers }, f.env)).status
		).toBe(400);
		expect(
			(
				await app.request(
					`${ORIGIN}/api/mcp/grants/missing/revoke`,
					{ method: 'POST', headers, body: '{}' },
					f.env
				)
			).status
		).toBe(403);
		const list = await app.request(`${ORIGIN}/api/mcp/grants`, { headers }, f.env);
		const data = (await list.json()) as { csrfToken: string };
		expect(
			(
				await app.request(
					`${ORIGIN}/api/mcp/grants/missing/revoke`,
					{
						method: 'POST',
						headers: { ...headers, Origin: 'https://attacker.example' },
						body: JSON.stringify({ csrfToken: data.csrfToken })
					},
					f.env
				)
			).status
		).toBe(403);
		expect(
			(
				await app.request(
					`${ORIGIN}/api/mcp/grants/missing/revoke`,
					{ method: 'POST', headers, body: JSON.stringify({ csrfToken: data.csrfToken }) },
					f.env
				)
			).status
		).toBe(200);
	});

	it('does not mount MCP limits or body caps on unrelated Hush routes', async () => {
		const f = await mcpFixture(McpAuthorization);
		const limit = vi.fn(async () => ({ success: false }));
		f.env.AUTH_LIMIT = { limit };
		const response = await app.request(`${ORIGIN}/api/health`, {}, f.env);
		expect(response.status).toBe(200);
		expect(limit).not.toHaveBeenCalled();
		const assets = await app.request(
			`${ORIGIN}/unrelated`,
			{ method: 'POST', body: 'a'.repeat(70 * 1024) },
			f.env
		);
		expect(assets.status).toBe(200);
		expect(limit).not.toHaveBeenCalled();
		expect(
			(await app.request(`${ORIGIN}/oauth/register`, { method: 'POST', body: '{}' }, f.env)).status
		).toBe(429);
	});

	it('prunes a bounded batch only during explicit writes and caps pending consent and registration', async () => {
		const f = await mcpFixture(McpAuthorization);
		for (let i = 0; i < 250; i++)
			f.store.values.set(`expired:${String(i).padStart(3, '0')}`, { expiresAt: NOW - 1 });
		await f.auth.validate('invalid');
		expect(f.store.writes).not.toHaveBeenCalled();
		await f.register();
		expect([...f.store.values.keys()].filter((key) => key.startsWith('expired:'))).toHaveLength(
			150
		);
		await f.register();
		await f.register();
		expect([...f.store.values.keys()].some((key) => key.startsWith('expired:'))).toBe(false);
		for (let i = 0; i < 1000; i++) f.store.values.set(`oauth:client:cap-${i}`, { value: '{}' });
		expect((await f.register()).response.status).toBe(503);
		for (let i = 0; i < 100; i++)
			f.store.values.set(`consent:cap-${i}`, { expiresAt: NOW + 60_000 });
		expect((await f.begin('missing')).response.status).toBe(429);
	});

	it('uses the API budget for data, discovery and management reads, and the auth budget for issuance', async () => {
		const f = await mcpFixture(McpAuthorization);
		const authLimit = vi.fn(async () => ({ success: false }));
		const apiLimit = vi.fn(async () => ({ success: true }));
		f.env.AUTH_LIMIT = { limit: authLimit };
		f.env.API_LIMIT = { limit: apiLimit };
		for (const path of [
			'/mcp',
			'/.well-known/oauth-protected-resource/mcp',
			'/.well-known/oauth-authorization-server',
			'/oauth/consent',
			'/api/mcp/consent?request=missing',
			'/api/mcp/grants'
		]) {
			const response = await app.request(
				`${ORIGIN}${path}`,
				{ headers: { Cookie: `hush_sid=${f.sid}` } },
				f.env
			);
			expect(response.status).not.toBe(429);
		}
		expect(apiLimit).toHaveBeenCalledTimes(6);
		expect(authLimit).not.toHaveBeenCalled();
		for (const path of ['/oauth/register', '/oauth/token', '/api/mcp/consent']) {
			const response = await app.request(`${ORIGIN}${path}`, { method: 'POST', body: '{}' }, f.env);
			expect(response.status).toBe(429);
		}
		expect((await app.request(`${ORIGIN}/oauth/authorize`, {}, f.env)).status).toBe(429);
		expect(authLimit).toHaveBeenCalledTimes(4);
		expect(apiLimit).toHaveBeenCalledTimes(6);
	});
});
