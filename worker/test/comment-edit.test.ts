import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: actions } = await import('../routes/actions');

afterEach(() => vi.unstubAllGlobals());

const parent = { number: 7, repository: { nameWithOwner: 'sandbox/web' } };
const ownComment = {
	__typename: 'IssueComment',
	viewerDidAuthor: true,
	viewerCanUpdate: true,
	issue: parent
};

function harness(gate: Partial<Env> = {}) {
	const recheck = vi.fn(async () => ({ ok: true }));
	const env = {
		POLLER: { idFromName: () => 'test', get: () => ({ recheck }) },
		...gate
	} as unknown as Env;
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		c.set('user', { id: 1 } as UserRow);
		await next();
	});
	app.route('/', actions);
	const edit = (payload: unknown = { id: 'IC_1', body: ' Edited **text** ' }) =>
		app.request(
			'/api/comments/edit',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			env
		);
	return { edit, recheck };
}

describe('comment editing', () => {
	it.each([
		['IssueComment', 'updateIssueComment', 'issueComment', 'id'],
		['PullRequestReview', 'updatePullRequestReview', 'pullRequestReview', 'pullRequestReviewId']
	])(
		'updates an owned %s and refreshes its actual parent',
		async (type, mutation, field, idField) => {
			const updated = {
				id: 'IC_1',
				body: 'Edited **text**',
				bodyHTML: '<p>Edited <strong>text</strong></p>'
			};
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					Response.json({
						data: { node: { ...ownComment, __typename: type, pullRequest: parent } }
					})
				)
				.mockResolvedValueOnce(Response.json({ data: { [mutation]: { [field]: updated } } }));
			vi.stubGlobal('fetch', fetchMock);
			const { edit, recheck } = harness();
			const response = await edit();
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				id: updated.id,
				body: updated.body,
				html: updated.bodyHTML
			});
			const request = JSON.parse(fetchMock.mock.calls[1][1].body);
			expect(request.query).toContain(`${idField}: $id`);
			expect(request.variables).toEqual({ id: 'IC_1', body: 'Edited **text**' });
			expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
		}
	);

	it.each([
		{ ...ownComment, viewerDidAuthor: false },
		{ ...ownComment, viewerCanUpdate: false }
	])('refuses a comment without ownership and update permission: %j', async (node) => {
		const fetchMock = vi.fn(async () => Response.json({ data: { node } }));
		vi.stubGlobal('fetch', fetchMock);
		const { edit, recheck } = harness();
		expect((await edit()).status).toBe(403);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(recheck).not.toHaveBeenCalled();
	});

	it.each([
		{ id: '../bad', body: 'Text' },
		{ id: 'IC_1', body: '' },
		{ id: 'IC_1', body: '   ' },
		{ id: 'IC_1', body: null },
		{ id: 'IC_1', body: 'a'.repeat(65_537) }
	])('rejects invalid input before contacting GitHub', async (payload) => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness().edit(payload)).status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps GitHub writes off during local tests', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect((await harness({ GITHUB_WRITES: 'off' }).edit()).status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses nodes outside the allowed repository', async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ data: { node: { repository: { nameWithOwner: 'other/private' } } } })
		);
		vi.stubGlobal('fetch', fetchMock);
		expect(
			(await harness({ GITHUB_WRITES: 'off', GITHUB_WRITES_ALLOW: 'sandbox/web' }).edit()).status
		).toBe(403);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([null, { __typename: 'Issue' }])(
		'does not mutate missing or unrelated nodes',
		async (node) => {
			const fetchMock = vi.fn(async () => Response.json({ data: { node } }));
			vi.stubGlobal('fetch', fetchMock);
			expect((await harness().edit()).status).toBe(node ? 400 : 404);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
	);

	it('returns a GitHub refusal without refreshing or retrying', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ data: { node: ownComment } }))
			.mockResolvedValueOnce(Response.json({ errors: [{ message: 'Comment is locked' }] }));
		vi.stubGlobal('fetch', fetchMock);
		const { edit, recheck } = harness();
		const response = await edit();
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: 'Comment is locked' });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(recheck).not.toHaveBeenCalled();
	});
});
