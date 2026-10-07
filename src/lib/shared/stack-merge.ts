import type { PeekStack } from './types';

export type StackMergePlan =
	| { kind: 'plain' }
	| { kind: 'stack'; mergesWithIt: number[]; rebasedAfter: number[] }
	| { kind: 'link'; chainBottomFirst: number[]; rebasedAfter: number[] }
	| { kind: 'leaves_behind'; stranded: number[] };

export const NO_STACK: PeekStack = {
	gitHubStacksEnabled: false,
	numberOnGitHub: null,
	openPrsBelowOnGitHub: [],
	mergesIntoDefaultBranch: true,
	openPrsAboveNearestFirst: [],
	branchesAbove: false
};

export function stackMergePlan(number: number, s: PeekStack): StackMergePlan {
	const above = s.openPrsAboveNearestFirst;
	if (s.numberOnGitHub !== null)
		return { kind: 'stack', mergesWithIt: s.openPrsBelowOnGitHub, rebasedAfter: above };
	if (!above.length) return { kind: 'plain' };
	const canLink = s.gitHubStacksEnabled && s.mergesIntoDefaultBranch && !s.branchesAbove;
	if (canLink) return { kind: 'link', chainBottomFirst: [number, ...above], rebasedAfter: above };
	return { kind: 'leaves_behind', stranded: above };
}

const MAX_REFS_NAMED = 3;

function refs(numbers: number[]) {
	const named = numbers.length > MAX_REFS_NAMED + 1 ? numbers.slice(0, MAX_REFS_NAMED) : numbers;
	const rest = numbers.length - named.length;
	const list = named.map((n) => `#${n}`).join(', ');
	return rest ? `${list} and ${rest} more` : list;
}
const isOrAre = (numbers: number[]) => (numbers.length === 1 ? 'is' : 'are');
const itOrThem = (numbers: number[]) => (numbers.length === 1 ? 'it' : 'them');

export function stackMergeNotice(plan: StackMergePlan): string | null {
	switch (plan.kind) {
		case 'plain':
			return null;
		case 'stack':
			return (
				[
					plan.mergesWithIt.length &&
						`This also merges ${refs(plan.mergesWithIt)}, which ${isOrAre(plan.mergesWithIt)} under it in the stack.`,
					plan.rebasedAfter.length && `GitHub rebases ${refs(plan.rebasedAfter)} after the merge.`
				]
					.filter(Boolean)
					.join(' ') || null
			);
		case 'link':
			return `Hush links ${refs(plan.chainBottomFirst)} as a stack on GitHub first, so GitHub rebases ${refs(plan.rebasedAfter)} after the merge.`;
		case 'leaves_behind':
			return `${refs(plan.stranded)} ${isOrAre(plan.stranded)} built on this branch. After a squash or rebase merge, rebase ${itOrThem(plan.stranded)} with git rebase --onto.`;
	}
}
