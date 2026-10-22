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
import app, { Workspace, McpAuthorization, Poller } from './worker/index.ts';
import { ANALYSIS_VERSION } from './worker/workspace/object.ts';
import { WorkspaceStore } from './worker/workspace/store.ts';
import { compileViews, viewScope } from './src/lib/model/compile.ts';
import { DEFAULT_SETTINGS } from './src/lib/shared/settings.ts';
import { subjectFixture } from './worker/test/subject-fixtures.ts';
let clock = Date.now();
Date.now = () => clock;
const TABLES = ['state', 'items', 'sources', 'view_state', 'alerts'];
export class FixtureWorkspace extends Workspace {
  async seed() {
    const store = new WorkspaceStore(this.ctx.storage);
    store.migrate();
    store.writeState('account', {userId: 1});
    const settings = structuredClone(DEFAULT_SETTINGS);
    const config = {me: 'synthetic-user', settings, teams: [], projectAccess: 'none', analysisVersion: ANALYSIS_VERSION, projects: []};
    store.create(config);
    const subject = subjectFixture({author: 'synthetic-user'});
    const item = {id: subject.id, revision: 1, facts: subject, project: {state: 'unavailable'}, analysis: null, attention: {seen: null, markedUnread: false, snooze: null, muted: false, pins: []}};
    const ctx = {dash: settings.dash, categoryGroups: settings.categoryGroups, smartDecisions: settings.smartDecisions, teams: [], analysisVersion: ANALYSIS_VERSION, now: clock};
    const compiled = compileViews(settings.views, ctx);
    const sources = new Map(compiled.sources.map((spec) => [spec.id, {spec, window: {candidates: spec.kind === subject.kind ? [{id: subject.id, updatedAt: subject.updatedAt}] : [], truncated: false}, failedSince: null, error: null}]));
    const views = new Map(settings.views.map((view) => [view.id, {scope: viewScope(view, ctx), members: [subject.id], retained: [], seededBindings: [], baseline: [], awaitingRefresh: []}]));
    const items = new Map([[item.id, item]]);
    store.save({
      data: {config, items, sources, views, revision: 1},
      changes: {items: new Set(items.keys()), removedItems: new Set(), sources: new Set(sources.keys()), removedSources: new Set(), views: new Set(views.keys()), removedViews: new Set(), config: false},
      alerts: [], changedViews: [], departed: [], interest: new Set(), nextBoundary: null
    }, clock);
    await this.ctx.storage.put({mcpAccessVersion: crypto.randomUUID()});
  }
  async alarm() {}
  notReady() {
    this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'config'");
  }
  failNextWrite() {
    const storage = this.ctx.storage;
    const put = storage.put.bind(storage);
    storage.put = async () => {
      storage.put = put;
      throw new Error('Synthetic write failure');
    };
  }
  async reset() {
    await this.stop();
    await this.updateSettings({});
    const first = await this.ctx.storage.get('mcpAccessVersion');
    await this.stop();
    await this.updateSettings({});
    const second = await this.ctx.storage.get('mcpAccessVersion');
    return {first, second};
  }
  async inspect() {
    const sql = Object.fromEntries(TABLES.map((table) => [table, this.ctx.storage.sql.exec('SELECT * FROM ' + table).toArray()]));
    return {entries: [...await this.ctx.storage.list()], sql, alarm: await this.ctx.storage.getAlarm()};
  }
}
export class FixtureAuthorization extends McpAuthorization {
  async inspect() { return {entries: [...await this.ctx.storage.list()], alarm: await this.ctx.storage.getAlarm()}; }
}
async function saveSettings(workspace, patches, fail) {
  try {
    if (fail) await workspace.failNextWrite();
    await Promise.all(patches.map((patch) => workspace.updateSettings(patch)));
    return {ok: true};
  } catch (error) {
    return {error: error.message};
  }
}
export { Poller };
export default { async fetch(request, env, ctx) {
  const path = new URL(request.url).pathname;
  const workspace = env.WORKSPACE.get(env.WORKSPACE.idFromName('1'));
  const auth = env.MCP_AUTH.get(env.MCP_AUTH.idFromName('mcp-authorization-v1'));
  if (path === '/__fixture/seed') { await workspace.seed(); return Response.json({ok:true}); }
  if (path === '/__fixture/inspect') return Response.json({workspace: await workspace.inspect(), oauth: await auth.inspect()});
  if (path === '/__fixture/not-ready') { await workspace.notReady(); return Response.json({ok:true}); }
  if (path === '/__fixture/active') return Response.json(await workspace.markSeen([]));
  if (path === '/__fixture/settings') { const body = await request.json(); return Response.json(await saveSettings(workspace, body.patches, body.fail)); }
  if (path === '/__fixture/reset') return Response.json(await workspace.reset());
  if (path === '/__fixture/time') { clock = (await request.json()).now; return Response.json({ok:true}); }
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
			POLLER: { className: 'Poller', useSQLite: true },
			WORKSPACE: { className: 'FixtureWorkspace', useSQLite: true },
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
	await request('/__fixture/time', { method: 'POST', body: JSON.stringify({ now }) });
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
	let tokens = await exchanged.json();
	const before = await (await request('/__fixture/inspect')).text();
	const call = (name = 'list_views') =>
		request('/mcp', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tokens.access_token}`,
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
		});
	const result = await call();
	assert.equal(result.status, 200, await result.clone().text());
	assert.equal((await result.json()).result.structuredContent.ok, true);
	assert.equal(await (await request('/__fixture/inspect')).text(), before);
	const save = (patches, fail = false) =>
		request('/__fixture/settings', { method: 'POST', body: JSON.stringify({ patches, fail }) });
	const baseline = await (await request('/__fixture/inspect')).json();
	const config = baseline.workspace.sql.state.find((row) => row.key === 'config');
	const { settings } = JSON.parse(config.value);
	assert.equal(
		(
			await (
				await save([
					{},
					{ pushWhileOpen: true },
					{
						views: [
							{
								...settings.views[0],
								name: 'Renamed',
								groupBy: 'repo',
								sort: { by: 'title', dir: 'asc', turnFirst: false }
							}
						]
					}
				])
			).json()
		).ok,
		true
	);
	const saved = await (await request('/__fixture/inspect')).json();
	const savedValues = new Map(saved.workspace.entries);
	assert.equal(
		savedValues.get('mcpAccessVersion'),
		new Map(baseline.workspace.entries).get('mcpAccessVersion')
	);
	const data = await (await call('get_view')).json();
	assert.equal(data.result.structuredContent.ok, true);
	assert.equal(data.result.structuredContent.data.totalItems, 1);
	const stable = await (await request('/__fixture/inspect')).text();
	assert.match(
		(
			await (
				await save([{ views: [{ ...settings.views[0], searches: ['repo:sandbox/other'] }] }], true)
			).json()
		).error,
		/Synthetic write failure/
	);
	assert.equal(await (await request('/__fixture/inspect')).text(), stable);
	const refresh = () =>
		request('/oauth/token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: client.client_id,
				grant_type: 'refresh_token',
				refresh_token: tokens.refresh_token,
				resource
			})
		});
	for (const offset of [16 * 60_000, 24 * 3600_000]) {
		await request('/__fixture/time', {
			method: 'POST',
			body: JSON.stringify({ now: now + offset })
		});
		assert.equal((await call()).status, 401);
		const response = await refresh();
		assert.equal(response.status, 200, await response.clone().text());
		const rotated = await response.json();
		assert.notEqual(rotated.refresh_token, tokens.refresh_token);
		tokens = rotated;
		assert.equal((await call()).status, 200);
		assert.equal(
			(await (await call('get_view')).json()).result.structuredContent.data.totalItems,
			1
		);
	}
	await request('/__fixture/time', { method: 'POST', body: JSON.stringify({ now }) });
	await request('/__fixture/not-ready');
	const coldBefore = await (await request('/__fixture/inspect')).text();
	assert.equal((await call()).status, 401);
	assert.equal(await (await request('/__fixture/inspect')).text(), coldBefore);
	assert.equal((await exchange()).status, 400);
	assert.equal((await request('/__fixture/active')).status, 200);
	const reset = await (await request('/__fixture/reset')).json();
	assert.notEqual(reset.first, 'initial');
	assert.notEqual(reset.second, 'initial');
	assert.notEqual(reset.first, reset.second);
	console.log(
		'workerd: grants survive concurrent harmless saves, silent rotating refresh, and real cached reads; failed writes change nothing; reset epochs are unique; passive reads preserve storage; an unready workspace and replay fail closed.'
	);
} finally {
	await mf?.dispose();
	await rm(temporary, { recursive: true, force: true });
}
