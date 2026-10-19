import type { Attachment } from 'svelte/attachments';
import { prefersReducedMotion } from 'svelte/motion';

const HEIGHT_CHANGE_MS = 200;
const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';

export const smoothHeight: Attachment<HTMLElement> = (outer) => {
	const content = outer.firstElementChild;
	if (!(content instanceof HTMLElement)) return;
	let shownHeight = content.offsetHeight;
	const observer = new ResizeObserver(() => {
		const nextHeight = content.offsetHeight;
		if (nextHeight === shownHeight) return;
		const fromHeight = shownHeight;
		shownHeight = nextHeight;
		if (prefersReducedMotion.current) return;
		outer.animate([{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }], {
			duration: HEIGHT_CHANGE_MS,
			easing: EASE_OUT
		});
	});
	observer.observe(content);
	return () => observer.disconnect();
};
