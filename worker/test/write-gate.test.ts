import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: actions } = await import('../routes/actions');
const { default: diff } = await import('../routes/diff');

afterEach(() => vi.unstubAllGlobals());

const executionCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
	props: {}
} as unknown as ExecutionContext;

const SANDBOX_ONLY = { GITHUB_WRITES: 'off', GITHUB_WRITES_ALLOW: 'sandbox/web' };

function harness() {
	const recheck = vi.fn(async () => ({ ok: true }));
	const env = {
		WORKSPACE: { idFromName: () => 'test', get: () => ({ recheck }) },
		...SANDBOX_ONLY
	} as unknown as Env;
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		c.set('user', { id: 1 } as UserRow);
		await next();
	});
	app.route('/', actions);
	app.route('/', diff);
	const post = (path: string, payload: unknown) =>
		app.request(
			path,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			env,
			executionCtx
		);
	return { post, recheck };
}

const nodeIn = (repo: string) =>
	Response.json({ data: { node: { number: 7, repository: { nameWithOwner: repo } } } });

const requestsTo = (fetchMock: ReturnType<typeof vi.fn>) =>
	fetchMock.mock.calls.map(([url, init]) => ({
		url: String(url),
		query: init?.body ? (JSON.parse(String(init.body)).query as string | undefined) : undefined
	}));

const singleComment = (repo: string, number: number) => ({
	repo,
	number,
	pullRequestId: 'PR_sandbox',
	commitOid: 'a'.repeat(40),
	path: 'app.ts',
	body: 'Looks good',
	line: 1,
	side: 'RIGHT',
	startLine: null,
	startSide: null,
	single: true
});

describe('single diff comments under the write gate', () => {
	it('refuses a repository outside the allow list, even with a pull request ID inside it', async () => {
		const fetchMock = vi.fn(async () => nodeIn('sandbox/web'));
		vi.stubGlobal('fetch', fetchMock);
		const { post, recheck } = harness();
		const response = await post('/api/diff/comment', singleComment('PostHog/posthog', 123));
		expect(response.status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(recheck).not.toHaveBeenCalled();
	});

	it('posts in an allowed repository and refreshes the pull request', async () => {
		const fetchMock = vi.fn(async () => Response.json({ id: 1 }, { status: 201 }));
		vi.stubGlobal('fetch', fetchMock);
		const { post, recheck } = harness();
		const response = await post('/api/diff/comment', singleComment('sandbox/web', 7));
		expect(response.status).toBe(200);
		expect(requestsTo(fetchMock).map((r) => r.url)).toEqual([
			'https://api.github.com/repos/sandbox/web/pulls/7/comments'
		]);
		expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
	});
});

describe('pull request node actions under the write gate', () => {
	const nodeActions = [
		{ action: 'auto_merge', method: 'SQUASH' },
		{ action: 'auto_merge_off' },
		{ action: 'ready' },
		{ action: 'draft' }
	];

	it.each(nodeActions)(
		'refuses $action on a pull request outside the allow list',
		async (choice) => {
			const fetchMock = vi.fn(async () => nodeIn('other/private'));
			vi.stubGlobal('fetch', fetchMock);
			const response = await harness().post('/api/actions', {
				repo: 'sandbox/web',
				number: 7,
				id: 'PR_other',
				...choice
			});
			expect(response.status).toBe(403);
			expect(requestsTo(fetchMock).map((r) => r.query?.split('(')[0])).toEqual(['query']);
		}
	);

	it.each(nodeActions)('refuses $action with a value that is not a node ID', async (choice) => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await harness().post('/api/actions', {
			repo: 'sandbox/web',
			number: 7,
			id: '../repos/other/private',
			...choice
		});
		expect(response.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(nodeActions)(
		'runs $action on a pull request in an allowed repository',
		async (choice) => {
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
				String(init?.body).includes('"query":"query')
					? nodeIn('sandbox/web')
					: Response.json({ data: {} })
			);
			vi.stubGlobal('fetch', fetchMock);
			const { post, recheck } = harness();
			const response = await post('/api/actions', {
				repo: 'sandbox/web',
				number: 7,
				id: 'PR_sandbox',
				...choice
			});
			expect(response.status).toBe(200);
			expect(requestsTo(fetchMock).map((r) => r.query?.split('(')[0])).toEqual([
				'query',
				'mutation'
			]);
			expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
		}
	);
});
