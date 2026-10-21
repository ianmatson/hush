import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = wranglerRequire('esbuild');
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'hush-mcp-workerd-'));
const origin = 'https://app.example.test';
const resource = `${origin}/mcp`;
const redirect = 'https://client.example.test/callback';
const session = 'synthetic-workerd-session';
const hash = async (value) =>
	Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString(
		'base64url'
	);
const script = `
import app, { Poller, McpAuthorization } from './worker/index.ts';
import { DEFAULT_SETTINGS } from './src/lib/shared/settings.ts';
import { SCHEMA_VERSION } from './worker/poller/schema.ts';
export class FixturePoller extends Poller {
  async seed(schema = SCHEMA_VERSION) {
    await this.ctx.storage.put({userId: 1, schema, settings: JSON.stringify(DEFAULT_SETTINGS)});
  }
  async inspect() { return {entries: [...await this.ctx.storage.list()], alarm: await this.ctx.storage.getAlarm()}; }
}
export class FixtureAuthorization extends McpAuthorization {
  async inspect() { return {entries: [...await this.ctx.storage.list()], alarm: await this.ctx.storage.getAlarm()}; }
}
export default { async fetch(request, env, ctx) {
  const path = new URL(request.url).pathname;
  const poller = env.POLLER.get(env.POLLER.idFromName('1'));
  const auth = env.MCP_AUTH.get(env.MCP_AUTH.idFromName('mcp-authorization-v1'));
  if (path === '/__fixture/seed') { await poller.seed(); return Response.json({ok:true}); }
  if (path === '/__fixture/inspect') return Response.json({poller: await poller.inspect(), oauth: await auth.inspect()});
  if (path === '/__fixture/bad-schema') { await poller.seed(2); return Response.json({ok:true}); }
  if (path === '/__fixture/active') return Response.json(await poller.markSeen([]));
  return app.fetch(request, env, ctx);
}};
`;
let mf;
try {
	const bundled = await build({
		stdin: {
			contents: script,
			resolveDir: root,
			sourcefile: 'mcp-workerd-fixture.ts',
			loader: 'ts'
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		conditions: ['workerd', 'browser'],
		external: ['cloudflare:*']
	});
	const options = convertV4MiniflareOptions({
		modules: true,
		script: bundled.outputFiles[0].text,
		compatibilityDate: '2026-07-01',
		durableObjects: {
			POLLER: { className: 'FixturePoller', useSQLite: true },
			MCP_AUTH: { className: 'FixtureAuthorization', useSQLite: true }
		},
		d1Databases: ['DB'],
		bindings: { APP_URL: origin },
		serviceBindings: { ASSETS: async () => new Response('synthetic assets') },
		outboundService: async () => {
			throw new Error('External network is blocked in this fixture');
		},
		durableObjectsPersist: false,
		d1Persist: false
	});
	options.resourceTmpPath = temporary;
	mf = new Miniflare(options);
	const db = await mf.getD1Database('DB');
	for (const name of (await readdir(join(root, 'migrations')))
		.filter((name) => name.endsWith('.sql'))
		.sort()) {
		const sql = await readFile(join(root, 'migrations', name), 'utf8');
		await db.exec(sql.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
	}
	const now = Date.now();
	await db
		.prepare(
			"INSERT INTO users (id, login, token_ct, token_iv, scopes, created_at, updated_at) VALUES (1, 'synthetic-user', '', '', '', ?, ?)"
		)
		.bind(now, now)
		.run();
	await db
		.prepare(
			"INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at, label) VALUES (?, 1, ?, ?, ?, 'fixture')"
		)
		.bind(await hash(session), now, now + 3600_000, now)
		.run();
	const request = (path, init) => mf.dispatchFetch(`${origin}${path}`, init);
	assert.equal((await request('/__fixture/seed')).status, 200);
	const registered = await request('/oauth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Synthetic workerd app',
			redirect_uris: [redirect],
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code']
		})
	});
	assert.equal(registered.status, 201);
	const client = await registered.json();
	const verifier = 'a'.repeat(64);
	const params = new URLSearchParams({
		client_id: client.client_id,
		response_type: 'code',
		redirect_uri: redirect,
		resource,
		scope: 'saved-views:read',
		code_challenge_method: 'S256',
		code_challenge: await hash(verifier)
	});
	const begun = await request(`/oauth/authorize?${params}`, {
		headers: { Cookie: `hush_sid=${session}` },
		redirect: 'manual'
	});
	assert.equal(begun.status, 302);
	const id = new URL(begun.headers.get('Location')).searchParams.get('request');
	const cookie = `hush_sid=${session}; ${begun.headers.get('Set-Cookie').split(';')[0]}`;
	const consentResponse = await request(`/api/mcp/consent?request=${id}`, {
		headers: { Cookie: cookie }
	});
	assert.equal(consentResponse.status, 200);
	const consent = await consentResponse.json();
	assert.equal(
		(await request('/api/mcp/consent?request=missing', { headers: { Cookie: cookie } })).status,
		400
	);
	const decide = (csrfToken) =>
		request('/api/mcp/consent', {
			method: 'POST',
			headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				requestId: id,
				csrfToken,
				viewIds: [consent.views[0].id],
				decision: 'allow'
			})
		});
	assert.equal((await decide('invalid')).status, 400);
	const approved = await decide(consent.csrfToken);
	assert.equal(approved.status, 200);
	const code = new URL((await approved.json()).redirectTo).searchParams.get('code');
	const exchange = () =>
		request('/oauth/token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: client.client_id,
				grant_type: 'authorization_code',
				code,
				code_verifier: verifier,
				redirect_uri: redirect,
				resource
			})
		});
	const exchanged = await exchange();
	assert.equal(exchanged.status, 200);
	const tokens = await exchanged.json();
	const before = await (await request('/__fixture/inspect')).text();
	const call = () =>
		request('/mcp', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'Mcp-Protocol-Version': '2026-07-28',
				'Mcp-Method': 'tools/call',
				'Mcp-Name': 'list_views'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: {
					name: 'list_views',
					arguments: {},
					_meta: {
						'io.modelcontextprotocol/protocolVersion': '2026-07-28',
						'io.modelcontextprotocol/clientInfo': { name: 'synthetic', version: '1' },
						'io.modelcontextprotocol/clientCapabilities': {}
					}
				}
			})
		});
	const result = await call();
	assert.equal(result.status, 200, await result.clone().text());
	assert.equal((await result.json()).result.structuredContent.ok, true);
	assert.equal(await (await request('/__fixture/inspect')).text(), before);
	await request('/__fixture/bad-schema');
	const coldBefore = await (await request('/__fixture/inspect')).text();
	assert.equal((await call()).status, 401);
	assert.equal(await (await request('/__fixture/inspect')).text(), coldBefore);
	assert.equal((await exchange()).status, 400);
	assert.equal((await request('/__fixture/active')).status, 200);
	console.log(
		'workerd: OAuth consent errors survive RPC; real token exchange and modern MCP succeed; reads preserve OAuth and Poller storage; unknown schema fails without migration; replay fails.'
	);
} finally {
	await mf?.dispose();
	await rm(temporary, { recursive: true, force: true });
}
