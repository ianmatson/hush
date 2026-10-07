import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeStackThrough, readStack } from '../stacks';

type Reply = { status?: number; body: unknown };

function gitHub(route: (url: string, init: RequestInit) => Reply) {
	const calls: { url: string; init: RequestInit }[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			const { status = 200, body } = route(url, init);
			return new Response(JSON.stringify(body), { status });
		})
	);
	return calls;
}

const prsOnBranch = (init: RequestInit) =>
	(JSON.parse(String(init.body)) as { variables: { b: string } }).variables.b;

const branchOnly: Record<string, { number: number; headRefName: string }[]> = {
	'forum-frontend': [{ number: 20765, headRefName: 'forum-cutover' }],
	'forum-cutover': [{ number: 20800, headRefName: 'forum-polish' }]
};

const bottom = { number: 20508, head: 'forum-frontend', base: 'master', defaultBranch: 'master' };

afterEach(() => vi.unstubAllGlobals());

describe('readStack', () => {
	it('walks the open PRs built on a branch-only stack', async () => {
		gitHub((url, init) =>
			url.includes('/stacks')
				? { body: [] }
				: {
						body: {
							data: { repository: { pullRequests: { nodes: branchOnly[prsOnBranch(init)] ?? [] } } }
						}
					}
		);
		expect(await readStack('t', 'PostHog/posthog.com', bottom)).toEqual({
			gitHubStacksEnabled: true,
			numberOnGitHub: null,
			openPrsBelowOnGitHub: [],
			mergesIntoDefaultBranch: true,
			openPrsAboveNearestFirst: [20765, 20800],
			branchesAbove: false
		});
	});

	it('reads the members of a stack on GitHub', async () => {
		const member = (number: number, state = 'open') => ({ number, state, merged_at: null });
		gitHub((url) =>
			url.includes('/stacks')
				? {
						body: [
							{
								number: 7,
								pull_requests: [member(1, 'closed'), member(2), member(20508), member(4)]
							}
						]
					}
				: { body: { data: { repository: { pullRequests: { nodes: [] } } } } }
		);
		const s = await readStack('t', 'acme/web', { ...bottom, base: 'below' });
		expect(s.numberOnGitHub).toBe(7);
		expect(s.openPrsBelowOnGitHub).toEqual([2]);
		expect(s.openPrsAboveNearestFirst).toEqual([4]);
		expect(s.mergesIntoDefaultBranch).toBe(false);
	});

	it('stops at a branch with two PRs on it, and knows when stacks are off', async () => {
		gitHub((url) =>
			url.includes('/stacks')
				? { status: 404, body: { message: 'Not Found' } }
				: {
						body: {
							data: {
								repository: {
									pullRequests: {
										nodes: [
											{ number: 2, headRefName: 'a' },
											{ number: 3, headRefName: 'b' }
										]
									}
								}
							}
						}
					}
		);
		const s = await readStack('t', 'acme/web', bottom);
		expect(s.gitHubStacksEnabled).toBe(false);
		expect(s.openPrsAboveNearestFirst).toEqual([2, 3]);
		expect(s.branchesAbove).toBe(true);
	});
});

describe('mergeStackThrough', () => {
	it('waits for the merge GitHub runs in the background', async () => {
		vi.useFakeTimers();
		let polls = 0;
		gitHub((url) => {
			if (!url.includes('/merge-async/'))
				return { status: 202, body: { status: 'pending', details: { uuid: 'u1' } } };
			polls++;
			return {
				body:
					polls < 2
						? { status: 'pending' }
						: { status: 'failed', details: { message: 'Conflicts.' } }
			};
		});
		const result = mergeStackThrough('t', 'acme/web', 1, 'SQUASH');
		await vi.runAllTimersAsync();
		expect(await result).toBe('Conflicts.');
		vi.useRealTimers();
	});
});
