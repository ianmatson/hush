import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_MAX, searchDashboard, searchSize } from './github';

describe('dashboard search sizes', () => {
	it('asks for the last count plus headroom, within 5 and 25', () => {
		expect(searchSize(undefined)).toBe(SEARCH_MAX);
		expect(searchSize(0)).toBe(5);
		expect(searchSize(1)).toBe(6);
		expect(searchSize(10)).toBe(15);
		expect(searchSize(40)).toBe(25);
	});
});

describe('searchDashboard', () => {
	afterEach(() => vi.unstubAllGlobals());

	/** A fake GitHub: `total` results exist; each search returns up to its `first`. */
	function fakeGitHub(total: number) {
		const firsts: number[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				const { query } = JSON.parse(String(init.body)) as { query: string };
				const first = Number(query.match(/first: (\d+)/)![1]);
				firsts.push(first);
				const nodes = Array.from({ length: Math.min(first, total) }, (_, k) => ({
					__typename: 'PullRequest',
					id: `PR_${k}`,
					number: k,
					title: `PR ${k}`,
					url: `https://github.com/o/r/pull/${k}`,
					state: 'OPEN',
					createdAt: '2026-09-01T00:00:00Z',
					updatedAt: '2026-09-02T00:00:00Z',
					repository: { nameWithOwner: 'o/r' },
					author: { login: 'alice' }
				}));
				return new Response(JSON.stringify({ data: { s0: { issueCount: total, nodes } } }));
			})
		);
		return firsts;
	}
	const q = [{ section: 'mine', q: 'is:pr author:@me' }];

	it('uses the small size when the section did not grow', async () => {
		const firsts = fakeGitHub(3);
		const r = await searchDashboard('t', 'ian', q, { 'is:pr author:@me': 3 });
		expect(firsts).toEqual([8]);
		expect(r.hits).toHaveLength(3);
		expect(r.counts).toEqual({ 'is:pr author:@me': 3 });
	});

	it('asks again at the full size when the section grew past its size, and loses nothing', async () => {
		const firsts = fakeGitHub(12);
		const r = await searchDashboard('t', 'ian', q, { 'is:pr author:@me': 1 });
		expect(firsts).toEqual([6, SEARCH_MAX]);
		expect(r.hits).toHaveLength(12);
		expect(r.counts['is:pr author:@me']).toBe(12);
	});
});
