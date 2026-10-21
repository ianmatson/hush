import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api';
import { mcpApi } from './mcp-api';

afterEach(() => vi.unstubAllGlobals());

describe('MCP browser requests', () => {
	it('does not persist consent responses in the browser HTTP cache', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({ requestId: 'request' }));
		vi.stubGlobal('fetch', fetch);
		await mcpApi.consent('request&other=1');
		expect(fetch).toHaveBeenCalledWith(
			'/api/mcp/consent?request=request%26other%3D1',
			expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
		);
	});

	it('sends the chosen views and request-bound CSRF token in one consent decision', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({ redirectTo: '/callback' }));
		vi.stubGlobal('fetch', fetch);
		const decision = {
			requestId: 'request',
			csrfToken: 'consent-csrf',
			viewIds: ['mine'],
			decision: 'allow' as const
		};
		await expect(mcpApi.decide(decision)).resolves.toEqual({ redirectTo: '/callback' });
		expect(fetch).toHaveBeenCalledWith(
			'/api/mcp/consent',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(decision),
				headers: { 'Content-Type': 'application/json' }
			})
		);
	});

	it('encodes the grant ID and sends the revocation CSRF token', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal('fetch', fetch);
		await mcpApi.revoke('grant/other', 'grants-csrf');
		expect(fetch).toHaveBeenCalledWith(
			'/api/mcp/grants/grant%2Fother/revoke',
			expect.objectContaining({ body: JSON.stringify({ csrfToken: 'grants-csrf' }) })
		);
	});

	it('preserves expired request errors for the UI', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ error: 'Request expired' }, { status: 410 }))
		);
		await expect(mcpApi.consent('expired')).rejects.toMatchObject({
			status: 410,
			message: 'Request expired'
		});
	});

	it('handles a server failure that does not contain JSON', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
		await expect(mcpApi.grants()).rejects.toEqual(new ApiError(503, 'Request failed (503)'));
	});
});
