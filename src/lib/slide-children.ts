import type { Attachment } from 'svelte/attachments';
import { prefersReducedMotion } from 'svelte/motion';

const SLIDE_MS = 180;
const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';

export const slideChildren: Attachment<HTMLElement> = (row) => {
	let shownLeft = new Map<Element, number>();
	let shownRowWidth = row.clientWidth;
	const resizes = new ResizeObserver(() => slideToNewPlaces());
	const childChanges = new MutationObserver(() => {
		observeChildren();
		slideToNewPlaces();
	});

	function children() {
		return [...row.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
	}

	function observeChildren() {
		resizes.disconnect();
		resizes.observe(row);
		for (const child of children()) resizes.observe(child);
	}

	function slideToNewPlaces() {
		const rowWidth = row.clientWidth;
		const rowResized = rowWidth !== shownRowWidth;
		shownRowWidth = rowWidth;
		const nextLeft = new Map<Element, number>();
		for (const child of children()) {
			const left = child.offsetLeft;
			nextLeft.set(child, left);
			const before = shownLeft.get(child);
			if (before === undefined || before === left || rowResized || prefersReducedMotion.current)
				continue;
			child.animate(
				[{ transform: `translateX(${before - left}px)` }, { transform: 'translateX(0)' }],
				{ duration: SLIDE_MS, easing: EASE_OUT }
			);
		}
		shownLeft = nextLeft;
	}

	observeChildren();
	slideToNewPlaces();
	childChanges.observe(row, { childList: true });
	return () => {
		resizes.disconnect();
		childChanges.disconnect();
	};
};
