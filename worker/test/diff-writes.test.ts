import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
const { default: diff } = await import('../routes/diff');

afterEach(() => vi.unstubAllGlobals());

function harness() {
	const recheck = vi.fn(async () => ({ ok: true }));
	const env = { POLLER: { idFromName: () => 'test', get: () => ({ recheck }) } } as unknown as Env;
	const app = new Hono<AppEnv>();
	app.use('*', async (c, next) => {
		c.set('user', { id: 1 } as UserRow);
		await next();
	});
	app.route('/', diff);
	return { app, env, recheck };
}

const writes = [
	['threads/reply', { threadId: 'PRRT_1', body: 'Reply' }],
	['threads/resolve', { threadId: 'PRRT_1', resolved: true }],
	['review/submit', { reviewId: 'PRR_1', event: 'APPROVE', body: '' }],
	['review/discard', { reviewId: 'PRR_1' }],
	['comment/edit', { commentId: 'PRRC_1', body: 'Edited' }],
	['comment/edit', { commentId: 'PRRC_1', body: null }],
	[
		'comment',
		{
			repo: 'sandbox/web',
			number: 7,
			pullRequestId: 'PR_1',
			commitOid: 'a'.repeat(40),
			path: 'app.ts',
			body: 'Review',
			line: 1,
			side: 'RIGHT',
			startLine: null,
			startSide: null,
			single: false
		}
	]
] as const;

describe('subject reconciliation after diff writes', () => {
	it.each(['missing', 'non-json', 'network'])(
		'allows writes after a %s parent lookup failure',
		async (failure) => {
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(async () => {
					if (failure === 'network') throw new Error('Network failed');
					return failure === 'non-json'
						? new Response('unavailable')
						: Response.json({ data: { node: null } });
				})
				.mockResolvedValueOnce(Response.json({ data: {} }));
			vi.stubGlobal('fetch', fetchMock);
			const { app, env, recheck } = harness();
			const response = await app.request(
				'/api/diff/review/submit',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(writes[2][1])
				},
				env
			);
			expect(response.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(recheck).not.toHaveBeenCalled();
		}
	);
	it.each(writes)('refreshes the parent after %s succeeds', async (path, payload) => {
		const requests: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const { query } = JSON.parse(String(init?.body));
				requests.push(query);
				return query.startsWith('query')
					? Response.json({
							data: {
								node: { pullRequest: { number: 7, repository: { nameWithOwner: 'sandbox/web' } } }
							}
						})
					: Response.json({ data: {} });
			})
		);
		const { app, env, recheck } = harness();
		const response = await app.request(
			'/api/diff/' + path,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			env
		);
		expect(response.status).toBe(200);
		expect(requests.map((query) => query.startsWith('query'))).toEqual([true, false]);
		expect(recheck).toHaveBeenCalledWith('sandbox/web', 7);
	});

	it('does not refresh or retry a refused mutation', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					Response.json({
						data: {
							node: { pullRequest: { number: 7, repository: { nameWithOwner: 'sandbox/web' } } }
						}
					})
				)
				.mockResolvedValueOnce(Response.json({ errors: [{ message: 'Refused' }] }))
		);
		const { app, env, recheck } = harness();
		const response = await app.request(
			'/api/diff/review/submit',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(writes[2][1])
			},
			env
		);
		expect(response.status).toBe(502);
		expect(recheck).not.toHaveBeenCalled();
	});
});
