import type { DiffHunk } from '$lib/shared/diff';
import type { HighlightedToken } from '$lib/highlight-core';
import type { HighlightRequest, HighlightResponse } from '$lib/highlight-protocol';

export type { HighlightedToken } from '$lib/highlight-core';

type Tokens = HighlightedToken[][][] | null;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (tokens: Tokens) => void>();

function settleAll(tokens: Tokens) {
	for (const resolve of pending.values()) resolve(tokens);
	pending.clear();
}

function highlighter(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./highlight.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = ({ data }: MessageEvent<HighlightResponse>) => {
		pending.get(data.id)?.(data.tokens);
		pending.delete(data.id);
	};
	worker.onerror = () => {
		settleAll(null);
		worker?.terminate();
		worker = null;
	};
	return worker;
}

export function highlightHunks(hunks: DiffHunk[], language: string): Promise<Tokens> {
	if (typeof Worker === 'undefined') return Promise.resolve(null);
	const id = nextId++;
	const request: HighlightRequest = { id, hunks, language };
	return new Promise<Tokens>((resolve) => {
		pending.set(id, resolve);
		highlighter().postMessage(request);
	});
}
