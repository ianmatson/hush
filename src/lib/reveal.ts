import { slide, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

const REVEAL_MS = 280;
const REVEAL_RISE_PX = 6;
const FOLLOW_SLACK_PX = 48;

export function revealEntry(node: Element): TransitionConfig {
	const opening = slide(node, { duration: REVEAL_MS, easing: cubicOut });
	return {
		...opening,
		css: (t, u) =>
			`${opening.css?.(t, u) ?? ''}; opacity: ${t}; transform: translateY(${u * REVEAL_RISE_PX}px)`
	};
}

function scrollParentOf(node: Element): HTMLElement | null {
	for (let el = node.parentElement; el; el = el.parentElement) {
		const { overflowY } = getComputedStyle(el);
		if (overflowY === 'auto' || overflowY === 'scroll') return el;
	}
	return null;
}

const gapBelow = (anchor: Element, scroller: HTMLElement) =>
	scroller.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom;

export function followWhileGrowing(anchor: Element, durationMs = REVEAL_MS) {
	const scroller = scrollParentOf(anchor);
	if (!scroller) return;
	const keptGap = gapBelow(anchor, scroller);
	const anchorWasInView = keptGap >= -FOLLOW_SLACK_PX;
	if (!anchorWasInView) return;
	const targetGap = Math.max(0, keptGap);
	const until = performance.now() + durationMs + 100;
	const step = (now: number) => {
		const pushedDown = targetGap - gapBelow(anchor, scroller);
		if (pushedDown > 0) scroller.scrollTop += pushedDown;
		if (now < until) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}
