import { describe, expect, it } from 'vitest';
import { NO_STACK, stackMergeNotice, stackMergePlan } from './stack-merge';
import type { PeekStack } from './types';

const stack = (over: Partial<PeekStack>): PeekStack => ({ ...NO_STACK, ...over });

describe('merging a PR in a stack', () => {
	it('merges a PR with nothing on top the usual way', () => {
		expect(stackMergePlan(1, NO_STACK)).toEqual({ kind: 'plain' });
		expect(stackMergeNotice({ kind: 'plain' })).toBeNull();
	});

	it('merges through GitHub when the PR is already in a GitHub stack', () => {
		const plan = stackMergePlan(
			2,
			stack({
				gitHubStacksEnabled: true,
				numberOnGitHub: 9,
				openPrsBelowOnGitHub: [1],
				openPrsAboveNearestFirst: [3]
			})
		);
		expect(plan).toEqual({ kind: 'stack', mergesWithIt: [1], rebasedAfter: [3] });
		expect(stackMergeNotice(plan)).toBe(
			'This also merges #1, which is under it in the stack. GitHub rebases #3 after the merge.'
		);
	});

	it('links a branch-only stack on GitHub before it merges the bottom PR', () => {
		const plan = stackMergePlan(
			1,
			stack({ gitHubStacksEnabled: true, openPrsAboveNearestFirst: [2, 3] })
		);
		expect(plan).toEqual({ kind: 'link', chainBottomFirst: [1, 2, 3], rebasedAfter: [2, 3] });
		expect(stackMergeNotice(plan)).toMatch(/links #1, #2, #3 as a stack/);
	});

	it('names at most three PRs in a long stack', () => {
		const plan = stackMergePlan(
			1,
			stack({ numberOnGitHub: 9, openPrsAboveNearestFirst: [2, 3, 4, 5, 6] })
		);
		expect(stackMergeNotice(plan)).toBe('GitHub rebases #2, #3, #4 and 2 more after the merge.');
	});

	it('warns when GitHub cannot take the stack', () => {
		const above = { openPrsAboveNearestFirst: [2] };
		const noStacks = stackMergePlan(1, stack(above));
		const notBottom = stackMergePlan(
			1,
			stack({ ...above, gitHubStacksEnabled: true, mergesIntoDefaultBranch: false })
		);
		const forked = stackMergePlan(
			1,
			stack({ gitHubStacksEnabled: true, openPrsAboveNearestFirst: [2, 3], branchesAbove: true })
		);
		expect(noStacks).toEqual({ kind: 'leaves_behind', stranded: [2] });
		expect(notBottom.kind).toBe('leaves_behind');
		expect(forked).toEqual({ kind: 'leaves_behind', stranded: [2, 3] });
		expect(stackMergeNotice(noStacks)).toMatch(/#2 is built on this branch.*rebase it/);
	});
});
