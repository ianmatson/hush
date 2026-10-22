import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: itemFields } = await import('../routes/item-fields');

afterEach(() => vi.unstubAllGlobals());

const executionCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
	props: {}
} as unknown as ExecutionContext;

function harness(gate: Partial<Env> = {}) {
	const recheck = vi.fn(async () => ({ ok: true }));
	const env = {
		WORKSPACE: { idFromName: () => 'test', get: () => ({ recheck }) },
		...gate
	} as unknown as Env;
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		c.set('user', { id: 1 } as UserRow);
		await next();
	});
	app.route('/', itemFields);
	const edit = (payload: unknown) =>
		app.request(
			'/api/item-fields',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			env,
			executionCtx
		);
	const get = (path: string) => app.request(path, {}, env, executionCtx);
	return { edit, get, recheck };
}

const requests = (fetchMock: ReturnType<typeof vi.fn>) =>
	fetchMock.mock.calls.map(([url, init]) => ({
		url: String(url),
		method: init?.method,
		body: init?.body ? JSON.parse(String(init.body)) : undefined
	}));

const ISSUE = 'https://api.github.com/repos/sandbox/web/issues/7';

describe('label and assignee edits', () => {
	it('adds labels in one request and removes each one by name', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json([]))
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		vi.stubGlobal('fetch', fetchMock);
		const { edit, recheck } = harness();
		const response = await edit({
			repo: 'sandbox/web',
			number: 7,
			field: 'labels',
			add: ['bug', 'ui'],
			remove: ['good first issue']
		});
		expect(response.status).toBe(200);
		expect(requests(fetchMock)).toEqual([
			{ url: `${ISSUE}/labels`, method: 'POST', body: { labels: ['bug', 'ui'] } },
			{ url: `${ISSUE}/labels/good%20first%20issue`, method: 'DELETE', body: undefined }
		]);
		expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
	});

	it('adds and removes assignees', async () => {
		const fetchMock = vi.fn(async () => Response.json({}, { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const response = await harness().edit({
			repo: 'sandbox/web',
			number: 7,
			field: 'assignees',
			add: ['ada'],
			remove: ['bob']
		});
		expect(response.status).toBe(200);
		expect(requests(fetchMock)).toEqual([
			{ url: `${ISSUE}/assignees`, method: 'POST', body: { assignees: ['ada'] } },
			{ url: `${ISSUE}/assignees`, method: 'DELETE', body: { assignees: ['bob'] } }
		]);
	});

	it('returns a GitHub refusal without refreshing', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ message: 'Must have triage access' }, { status: 403 })
		);
		vi.stubGlobal('fetch', fetchMock);
		const { edit, recheck } = harness();
		const response = await edit({
			repo: 'sandbox/web',
			number: 7,
			field: 'labels',
			add: ['bug'],
			remove: []
		});
		expect(response.status).toBe(422);
		expect(recheck).not.toHaveBeenCalled();
	});

	it.each([
		{ repo: 'sandbox', number: 7, field: 'labels', add: ['bug'], remove: [] },
		{ repo: 'sandbox/web', number: 0, field: 'labels', add: ['bug'], remove: [] },
		{ repo: 'sandbox/web', number: 7, field: 'milestone', add: ['v1'], remove: [] },
		{ repo: 'sandbox/web', number: 7, field: 'labels', add: [], remove: [] },
		{ repo: 'sandbox/web', number: 7, field: 'assignees', add: ['../x'], remove: [] }
	])('rejects invalid input before contacting GitHub: %j', async (payload) => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness().edit(payload)).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps GitHub writes to the allowed repositories', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const { edit } = harness({ GITHUB_WRITES: 'off', GITHUB_WRITES_ALLOW: 'sandbox/web' });
		const response = await edit({
			repo: 'other/private',
			number: 7,
			field: 'labels',
			add: ['bug'],
			remove: []
		});
		expect(response.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('label and assignee choices', () => {
	it('searches the repository labels by name', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				data: {
					repository: {
						labels: { nodes: [{ name: 'bug', color: 'd73a4a', description: '' }] }
					}
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const response = await harness().get('/api/item-fields/sandbox/web/labels?q=bu');
		expect(await response.json()).toEqual({
			labels: [{ name: 'bug', color: 'd73a4a', description: null }]
		});
		expect(requests(fetchMock)[0].body.variables).toEqual({ o: 'sandbox', r: 'web', q: 'bu' });
	});

	it('lists assignable users without a search', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				data: {
					repository: {
						assignableUsers: { nodes: [{ login: 'ada', name: 'Ada', avatarUrl: 'https://a' }] }
					}
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const response = await harness().get('/api/item-fields/sandbox/web/assignees');
		expect(await response.json()).toEqual({
			users: [{ login: 'ada', name: 'Ada', avatar: 'https://a' }]
		});
		expect(requests(fetchMock)[0].body.variables.q).toBeNull();
	});

	it('refuses a search that is too long', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await harness().get(
			`/api/item-fields/sandbox/web/labels?q=${'a'.repeat(101)}`
		);
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
