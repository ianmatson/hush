import type { DiffHunk } from '$lib/shared/diff';
import type { HighlightedToken } from '$lib/highlight-core';

export interface HighlightRequest {
	id: number;
	hunks: DiffHunk[];
	language: string;
}

export interface HighlightResponse {
	id: number;
	tokens: HighlightedToken[][][] | null;
}
