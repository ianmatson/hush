import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: actions } = await import('../routes/actions');

afterEach(() => vi.unstubAllGlobals());

const REPO = 'ianmatson/hush';
const BRANCH_REF = `https://api.github.com/repos/${REPO}/git/refs/heads/ian/delete-branch`;

const executionCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
	props: {}
} as unknown as ExecutionContext;

type GitHubSetup = {
	headRepo?: string | null;
	prsOnBranch?: { number: number; headRefName: string }[];
	deleteStatus?: number;
	gitHubStacks?: boolean;
};

function gitHub({
	headRepo = REPO,
	prsOnBranch = [],
	deleteStatus = 204,
	gitHubStacks = true
}: GitHubSetup = {}) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const query = init?.body ? (JSON.parse(String(init.body)).query as string | undefined) : '';
		if (query?.includes('deleteBranchOnMerge'))
			return Response.json({
				data: {
					repository: {
						defaultBranchRef: { name: 'main' },
						deleteBranchOnMerge: false,
						pullRequest: {
							headRefName: 'ian/delete-branch',
							baseRefName: 'main',
							headRepository: headRepo ? { nameWithOwner: headRepo } : null
						}
					}
				}
			});
		if (query?.includes('pullRequests(baseRefName'))
			return Response.json({ data: { repository: { pullRequests: { nodes: prsOnBranch } } } });
		if (url.includes('/stacks'))
			return gitHubStacks
				? Response.json([])
				: Response.json({ message: 'Not Found' }, { status: 404 });
		if (url.endsWith('/pulls/7/merge')) return Response.json({ merged: true });
		if (url === BRANCH_REF && init?.method === 'DELETE')
			return deleteStatus === 204
				? new Response(null, { status: 204 })
				: Response.json(
						{ message: 'Cannot delete this protected branch' },
						{ status: deleteStatus }
					);
		return Response.json({ message: 'Not Found' }, { status: 404 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

async function merge(deleteBranch: boolean) {
	const env = {
		WORKSPACE: { idFromName: () => 'test', get: () => ({ recheck: async () => ({ ok: true }) }) }
	} as unknown as Env;
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		c.set('user', { id: 1 } as UserRow);
		await next();
	});
	app.route('/', actions);
	const res = await app.request(
		'/api/actions',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				repo: REPO,
				number: 7,
				action: 'merge',
				method: 'SQUASH',
				deleteBranch
			})
		},
		env,
		executionCtx
	);
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const branchDeletes = (fetchMock: ReturnType<typeof gitHub>) =>
	fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);

describe('deleting the branch after a merge', () => {
	it('deletes the branch when asked', async () => {
		const fetchMock = gitHub();
		const { status, body } = await merge(true);
		expect(status).toBe(200);
		expect(body).toMatchObject({ ok: true, deletedBranch: true, branchError: null });
		expect(branchDeletes(fetchMock)).toEqual([BRANCH_REF]);
	});

	it('keeps the branch when not asked', async () => {
		const fetchMock = gitHub();
		const { body } = await merge(false);
		expect(body).toMatchObject({ ok: true, deletedBranch: false, branchError: null });
		expect(branchDeletes(fetchMock)).toEqual([]);
	});

	it('keeps the branch of a fork', async () => {
		const fetchMock = gitHub({ headRepo: 'someone/hush' });
		const { body } = await merge(true);
		expect(body).toMatchObject({ ok: true, deletedBranch: false });
		expect(branchDeletes(fetchMock)).toEqual([]);
	});

	it('keeps a branch that other open PRs are built on', async () => {
		const fetchMock = gitHub({
			prsOnBranch: [{ number: 8, headRefName: 'ian/next' }],
			gitHubStacks: false
		});
		const { body } = await merge(true);
		expect(body).toMatchObject({ ok: true, deletedBranch: false });
		expect(branchDeletes(fetchMock)).toEqual([]);
	});

	it('reports the merge as done when GitHub refuses to delete the branch', async () => {
		gitHub({ deleteStatus: 422 });
		const { status, body } = await merge(true);
		expect(status).toBe(200);
		expect(body).toMatchObject({ ok: true, deletedBranch: false });
		expect(body.branchError).toContain('protected branch');
	});
});
