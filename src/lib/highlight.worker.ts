import { highlightHunksNow } from '$lib/highlight-core';
import type { HighlightRequest, HighlightResponse } from '$lib/highlight-protocol';

const scope = self as unknown as Worker;

scope.onmessage = async ({ data }: MessageEvent<HighlightRequest>) => {
	const tokens = await highlightHunksNow(data.hunks, data.language).catch(() => null);
	const response: HighlightResponse = { id: data.id, tokens };
	scope.postMessage(response);
};
