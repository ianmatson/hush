import { browser } from '$app/environment';
import type { MergeMethod } from '$lib/shared/types';

const STORAGE_KEY = 'hush:merge-method';
const DEFAULT_METHOD: MergeMethod = 'SQUASH';
const KNOWN_METHODS: readonly string[] = ['SQUASH', 'MERGE', 'REBASE'] satisfies MergeMethod[];

const isMergeMethod = (value: string | null): value is MergeMethod =>
	value !== null && KNOWN_METHODS.includes(value);

function storedMethod(): MergeMethod {
	const value = browser ? localStorage.getItem(STORAGE_KEY) : null;
	return isMergeMethod(value) ? value : DEFAULT_METHOD;
}

export const preferredMerge = $state<{ method: MergeMethod }>({ method: storedMethod() });

export function preferMergeMethod(method: MergeMethod) {
	preferredMerge.method = method;
	localStorage.setItem(STORAGE_KEY, method);
}
