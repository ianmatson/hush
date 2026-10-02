import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSsoHeader, searchDashboard } from '../github';
import { tokenHelp } from '../../src/lib/token-help';
import { vapidFromEnv } from '../webpush';

describe('parseSsoHeader', () => {
	it('reads the org ids GitHub left out', () => {
		expect(parseSsoHeader('partial-results; organizations=21955855,20582480')).toEqual([
			'21955855',
			'20582480'
		]);
		expect(parseSsoHeader(null)).toEqual([]);
		expect(parseSsoHeader('required; url=https://github.com/orgs/x/sso')).toEqual([]);
	});
});

describe('tokenHelp', () => {
	it('explains an org that blocks classic tokens', () => {
		const h = tokenHelp(
			'`acme` forbids access via a personal access token (classic). Please use a GitHub App, OAuth App, or a personal access token with fine-grained permissions.'
		);
		expect(h?.title).toBe('acme blocks classic tokens');
	});
	it('explains an org that has not approved the OAuth app', () => {
		const h = tokenHelp(
			'Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.'
		);
		expect(h?.title).toBe('acme has not approved Hush');
	});
	it('ignores other errors', () => {
		expect(tokenHelp('Something else')).toBeNull();
	});
});

describe('vapidFromEnv', () => {
	it('uses the app URL when no contact is set', () => {
		const env = { VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k' };
		expect(vapidFromEnv(env, 'https://hush.example').subject).toBe('https://hush.example');
		expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'mailto:a@b.c' }, 'https://x').subject).toBe(
			'mailto:a@b.c'
		);
	});
});

describe('searchDashboard', () => {
	const queries = Array.from({ length: 6 }, (_, i) => ({ section: 'mine', q: `is:pr q${i}` }));
	const answer = (searches: number) =>
		new Response(
			JSON.stringify({
				data: Object.fromEntries(
					Array.from({ length: searches }, (_, j) => [`s${j}`, { issueCount: 0, nodes: [] }])
				)
			})
		);
	const searchesIn = (init?: RequestInit) =>
		(JSON.parse(String(init?.body)).query.match(/search\(/g) ?? []).length;

	afterEach(() => vi.unstubAllGlobals());

	it('asks again in halves when GitHub takes too long', async () => {
		const sizes: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				const n = searchesIn(init);
				sizes.push(n);
				return n > 1 ? new Response('', { status: 502 }) : answer(n);
			})
		);
		const r = await searchDashboard('t', 'ian', queries);
		expect(r.errors).toEqual([]);
		expect(Object.keys(r.counts)).toHaveLength(6);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
	});

	it('says so when even one search takes too long', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 504 }))
		);
		const r = await searchDashboard('t', 'ian', queries.slice(0, 1));
		expect(r.errors[0]).toMatch(/took too long/);
	});
});
