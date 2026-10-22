import { browser } from '$app/environment';
import type { MergeMethod } from '$lib/shared/types';

const STORAGE_KEY = 'hush:merge-method';
const DELETE_BRANCH_KEY = 'hush:delete-branch-after-merge';
const DEFAULT_METHOD: MergeMethod = 'SQUASH';
const KNOWN_METHODS: readonly string[] = ['SQUASH', 'MERGE', 'REBASE'] satisfies MergeMethod[];

const isMergeMethod = (value: string | null): value is MergeMethod =>
	value !== null && KNOWN_METHODS.includes(value);

function storedMethod(): MergeMethod {
	const value = browser ? localStorage.getItem(STORAGE_KEY) : null;
	return isMergeMethod(value) ? value : DEFAULT_METHOD;
}

const storedDeleteBranch = () => browser && localStorage.getItem(DELETE_BRANCH_KEY) === 'true';

export const preferredMerge = $state<{ method: MergeMethod; deleteBranch: boolean }>({
	method: storedMethod(),
	deleteBranch: storedDeleteBranch()
});

export function preferMergeMethod(method: MergeMethod) {
	preferredMerge.method = method;
	localStorage.setItem(STORAGE_KEY, method);
}

export function preferDeleteBranch(deleteBranch: boolean) {
	preferredMerge.deleteBranch = deleteBranch;
	localStorage.setItem(DELETE_BRANCH_KEY, String(deleteBranch));
}
