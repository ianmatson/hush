import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { PeekDTO } from '../../src/lib/shared/types';
import type { AppEnv } from '../app';
import type { Env, UserRow } from '../db';
import { subjectFixture } from './subject-fixtures';

vi.mock('../db', () => ({ userToken: vi.fn(async () => 'test-token') }));
vi.mock('../github', async (importOriginal) => ({
	...(await importOriginal<typeof import('../github')>()),
	fetchPeek: vi.fn()
}));

const { default: subjects } = await import('../routes/subjects');
const { fetchPeek } = await import('../github');

describe('peek', () => {
	it('answers at once, and asks the workspace to read the item again', async () => {
		const subject = subjectFixture();
		const recheck = vi.fn(() => new Promise<void>(() => {}));
		const env = {
			WORKSPACE: { idFromName: () => 'test', get: () => ({ recheck }) }
		} as unknown as Env;
		const waitUntil = vi.fn();
		const app = new Hono<AppEnv>();
		app.use('*', async (c, next) => {
			c.set('user', { id: 1, login: 'ian' } as UserRow);
			await next();
		});
		app.route('/', subjects);
		vi.mocked(fetchPeek).mockResolvedValue({
			peek: { kind: 'pr', number: 1, title: 'Fix' } as PeekDTO,
			subject
		});
		const res = await app.request('/api/peek/sandbox/web/1', {}, env, {
			waitUntil,
			passThroughOnException: () => {},
			props: {}
		} as unknown as ExecutionContext);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ kind: 'pr', number: 1, title: 'Fix' });
		expect(recheck).toHaveBeenCalledWith('sandbox/web', 1, subject.id);
		expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
	});
});
