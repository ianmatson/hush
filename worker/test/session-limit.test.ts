import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

const { default: app } = await import('../index');

function envWith(success: boolean) {
	const limit = vi.fn(async () => ({ success }));
	const env = {
		DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
		API_LIMIT: { limit }
	};
	return { env, limit };
}

const bogusSession = { Cookie: 'hush_sid=made-up', 'CF-Connecting-IP': '203.0.113.7' };

describe('session check', () => {
	it('limits requests by IP when the session cookie matches no session', async () => {
		const { env, limit } = envWith(false);
		const res = await app.request('/api/me', { headers: bogusSession }, env);
		expect(res.status).toBe(429);
		expect(limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.7' });
	});

	it('answers 401 for an unknown session while the IP is under its limit', async () => {
		const { env } = envWith(true);
		const res = await app.request('/api/me', { headers: bogusSession }, env);
		expect(res.status).toBe(401);
	});
});
