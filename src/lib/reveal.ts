import { tick } from 'svelte';
import { slide, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

const REVEAL_MS = 280;
const REVEAL_RISE_PX = 6;
const FOLLOW_SLACK_PX = 48;

export function revealEntry(node: Element, { instant = false } = {}): TransitionConfig {
	if (instant) return { duration: 0 };
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

export async function keepInPlace(anchor: Element | null, change: () => void) {
	const scroller = anchor && (scrollParentOf(anchor) ?? document.scrollingElement);
	const topBefore = anchor?.getBoundingClientRect().top;
	change();
	await tick();
	if (!anchor?.isConnected || !scroller || topBefore === undefined) return;
	scroller.scrollTop += anchor.getBoundingClientRect().top - topBefore;
}

const COLLAPSE_SIDEWAYS_MS = 200;

export function collapseSideways(node: Element): TransitionConfig {
	const fullWidth = node.getBoundingClientRect().width;
	const parent = node.parentElement;
	const siblingGap = parent ? parseFloat(getComputedStyle(parent).columnGap) || 0 : 0;
	return {
		duration: COLLAPSE_SIDEWAYS_MS,
		easing: cubicOut,
		css: (t, u) =>
			`overflow: hidden; white-space: nowrap; width: ${t * fullWidth}px; margin-inline-start: ${-u * siblingGap}px; opacity: ${t}`
	};
}
