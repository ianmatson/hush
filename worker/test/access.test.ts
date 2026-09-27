import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedOrgs, checkAccess } from '../access';

function mockGitHub(byOrg: Record<string, { status: number; body?: unknown }>) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			const org = decodeURIComponent(String(url).split('/orgs/')[1] ?? '');
			const r = byOrg[org] ?? { status: 404 };
			return new Response(r.body ? JSON.stringify(r.body) : null, { status: r.status });
		})
	);
}

afterEach(() => vi.unstubAllGlobals());

describe('allowedOrgs', () => {
	it('parses a comma list and treats empty as open', () => {
		expect(allowedOrgs({ ALLOWED_ORGS: ' acme , Other ' })).toEqual(['acme', 'Other']);
		expect(allowedOrgs({})).toEqual([]);
	});
});

describe('checkAccess', () => {
	it('lets everyone in when no org is set', async () => {
		expect(await checkAccess('t', [])).toEqual({ ok: true });
	});

	it('allows an active member', async () => {
		mockGitHub({ acme: { status: 200, body: { state: 'active' } } });
		expect(await checkAccess('t', ['acme'])).toEqual({ ok: true });
	});

	it('rejects a pending invite and a non-member', async () => {
		mockGitHub({ acme: { status: 200, body: { state: 'pending' } } });
		expect(await checkAccess('t', ['acme'])).toMatchObject({ ok: false, reason: 'not_member' });
		mockGitHub({});
		expect(await checkAccess('t', ['acme'])).toMatchObject({ ok: false, reason: 'not_member' });
	});

	it('reports a blocked token as an error, not as "not a member"', async () => {
		mockGitHub({
			acme: {
				status: 403,
				body: { message: '`acme` forbids access via a personal access token (classic).' }
			}
		});
		const r = await checkAccess('t', ['acme']);
		expect(r).toMatchObject({ ok: false, reason: 'error' });
		expect(!r.ok && r.message).toMatch(/forbids access/);
	});
});
