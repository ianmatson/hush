import type { HunkLines } from '$lib/shared/diff';
import type { HighlightedToken } from '$lib/highlight-core';

export interface HighlightRequest {
	id: number;
	hunks: HunkLines[];
	language: string;
}

export interface HighlightResponse {
	id: number;
	tokens: HighlightedToken[][][] | null;
}
