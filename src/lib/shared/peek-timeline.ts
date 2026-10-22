import type { PeekDTO, PeekTimelinePage } from './types';

export const hiddenOlderCount = (p: PeekDTO) =>
	Math.max(0, p.timeline.total - p.timeline.items.length);

export function keepLoadedOlder(cached: PeekDTO | undefined, fresh: PeekDTO): PeekDTO {
	const freshOldest = fresh.timeline.items[0];
	if (!cached || !freshOldest || fresh.timeline.before === null) return fresh;
	const seam = cached.timeline.items.findIndex((e) => e.id === freshOldest.id);
	if (seam <= 0) return fresh;
	return {
		...fresh,
		timeline: {
			...fresh.timeline,
			items: [...cached.timeline.items.slice(0, seam), ...fresh.timeline.items],
			before: cached.timeline.before
		}
	};
}

export function withOlderPage(peek: PeekDTO, requestedBefore: string, page: PeekTimelinePage) {
	if (peek.timeline.before !== requestedBefore) return peek;
	const shown = new Set(peek.timeline.items.map((e) => e.id));
	return {
		...peek,
		timeline: {
			...peek.timeline,
			items: [...page.items.filter((e) => !shown.has(e.id)), ...peek.timeline.items],
			before: page.before
		}
	};
}
