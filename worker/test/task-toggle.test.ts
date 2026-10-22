import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: tasks } = await import('../routes/tasks');

afterEach(() => vi.unstubAllGlobals());

const executionCtx = {
	waitUntil: () => {},
	passThroughOnException: () => {},
	props: {}
} as unknown as ExecutionContext;

const parent = { number: 7, repository: { nameWithOwner: 'sandbox/web' } };
const body = '## Plan\n\n- [ ] one\n- [x] two\n';
const description = { __typename: 'PullRequest', body, viewerCanUpdate: true, ...parent };

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
	app.route('/', tasks);
	const toggle = (payload: unknown = { id: 'PR_1', index: 0, count: 2, checked: true }) =>
		app.request(
			'/api/tasks/toggle',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			env,
			executionCtx
		);
	return { toggle, recheck };
}

describe('task checkbox toggling', () => {
	it.each([
		['PullRequest', 'updatePullRequest', 'pullRequest', 'pullRequestId', parent],
		['Issue', 'updateIssue', 'issue', 'id', parent],
		['IssueComment', 'updateIssueComment', 'issueComment', 'id', { issue: parent }],
		[
			'PullRequestReview',
			'updatePullRequestReview',
			'pullRequestReview',
			'pullRequestReviewId',
			{ pullRequest: parent }
		]
	])('saves the toggled Markdown of a %s', async (type, mutation, field, idField, where) => {
		const saved = { body: '## Plan\n\n- [x] one\n- [x] two\n', bodyHTML: '<ul></ul>' };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					data: { node: { __typename: type, body, viewerCanUpdate: true, ...where } }
				})
			)
			.mockResolvedValueOnce(Response.json({ data: { [mutation]: { [field]: saved } } }));
		vi.stubGlobal('fetch', fetchMock);
		const { toggle, recheck } = harness();
		const response = await toggle();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ body: saved.body, html: saved.bodyHTML });
		const request = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(request.query).toContain(`${idField}: $id`);
		expect(request.variables).toEqual({ id: 'PR_1', body: saved.body });
		expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
	});

	it.each([
		[{ index: 0, count: 3, checked: true }, 'mismatch'],
		[{ index: 1, count: 2, checked: true }, 'changed']
	])('answers 409 without a write when the Markdown does not match: %j', async (toggle) => {
		const fetchMock = vi.fn(async () => Response.json({ data: { node: description } }));
		vi.stubGlobal('fetch', fetchMock);
		const { toggle: send, recheck } = harness();
		expect((await send({ id: 'PR_1', ...toggle })).status).toBe(409);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(recheck).not.toHaveBeenCalled();
	});

	it('refuses text that you cannot update', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ data: { node: { ...description, viewerCanUpdate: false } } })
		);
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness().toggle()).status).toBe(403);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ id: '../bad', index: 0, count: 1, checked: true },
		{ id: 'PR_1', index: -1, count: 1, checked: true },
		{ id: 'PR_1', index: 1, count: 1, checked: true },
		{ id: 'PR_1', index: 0.5, count: 1, checked: true },
		{ id: 'PR_1', index: 0, count: 1, checked: 'yes' }
	])('rejects invalid input before contacting GitHub: %j', async (payload) => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness().toggle(payload)).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps GitHub writes off during local tests', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness({ GITHUB_WRITES: 'off' }).toggle()).status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses nodes outside the allowed repository', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				data: { node: { ...description, repository: { nameWithOwner: 'other/private' } } }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		expect(
			(await harness({ GITHUB_WRITES: 'off', GITHUB_WRITES_ALLOW: 'sandbox/web' }).toggle()).status
		).toBe(403);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([null, { __typename: 'Commit', body: '' }])(
		'does not write missing or unrelated nodes',
		async (node) => {
			const fetchMock = vi.fn(async () => Response.json({ data: { node } }));
			vi.stubGlobal('fetch', fetchMock);
			expect((await harness().toggle()).status).toBe(404);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
	);
});
