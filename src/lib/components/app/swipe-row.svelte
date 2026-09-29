<script lang="ts" module>
	import type { Component } from 'svelte';

	/** One side of a swipe: what shows behind the row, and what it does. */
	export interface SwipeSide {
		label: string;
		icon: Component;
		/** Background and text classes of the revealed area. */
		tone: string;
		run: () => void;
	}

	/** Only one row rests open at a time: opening one closes the last. */
	let closeOpen: (() => void) | null = null;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { cn } from '$lib/utils';
	import { rowMenus } from '$lib/row-menus.svelte';

	/**
	 * A list row that you can swipe on a touch screen, like Mail: the row follows the finger and
	 * shows the action behind it. A short swipe rests open with the action as a button to tap; a
	 * long one acts at once. Only touch swipes: a mouse or pen never starts one (on the dashboards
	 * they drag). A mostly vertical move scrolls the page as usual.
	 */
	let {
		left,
		right,
		children
	}: {
		/** A swipe to the left (the action shows on the right). */
		left: SwipeSide | null;
		/** A swipe to the right (the action shows on the left). */
		right: SwipeSide | null;
		children: Snippet;
	} = $props();

	/** How much of the action a row that rests open shows. */
	const REST = 88;
	/** A swipe shorter than this goes back when you let go. */
	const OPEN_AT = 40;

	let el = $state<HTMLElement | null>(null);
	let dx = $state(0);
	let dragging = $state(false);
	let start: { x: number; y: number; id: number; from: number } | null = null;
	let horizontal = false;
	let width = 0;
	let buzzed = false;
	/** The click that ends a swipe, or that closes an open row, must not also open the row. */
	let swallowClick = false;

	const actLine = () => Math.max(160, width * 0.55);
	const side = $derived(dx > 0 ? right : dx < 0 ? left : null);
	const acts = $derived(!!side && Math.abs(dx) >= actLine());
	const resting = $derived(!dragging && Math.abs(dx) === REST);

	function close() {
		dx = 0;
		if (closeOpen === close) closeOpen = null;
	}
	// A click on any row (and so on this one) closes it, the same as the row menus.
	$effect(() => {
		void rowMenus.epoch;
		untrack(() => {
			if (!dragging && dx) close();
		});
	});

	function down(e: PointerEvent) {
		if (e.pointerType !== 'touch' || (!left && !right) || !el) return;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId, from: dx };
		horizontal = false;
		buzzed = false;
		width = el.offsetWidth;
	}

	function move(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const mx = e.clientX - start.x;
		const my = e.clientY - start.y;
		if (!horizontal) {
			if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
			// Mostly vertical: a scroll, not a swipe.
			if (Math.abs(mx) < Math.abs(my) * 1.3) return void (start = null);
			horizontal = true;
			dragging = true;
			el?.setPointerCapture(e.pointerId);
		}
		let d = start.from + mx;
		if ((d > 0 && !right) || (d < 0 && !left)) d = d / 6; // A side with no action resists.
		dx = Math.max(-width, Math.min(width, d));
		if (acts && !buzzed) {
			buzzed = true;
			navigator.vibrate?.(8);
		}
	}

	function end() {
		const s = start;
		start = null;
		if (!s) return;
		if (!dragging) {
			// A tap on a row that rests open closes it.
			if (s.from) {
				swallow();
				close();
			}
			return;
		}
		dragging = false;
		swallow();
		if (acts && side) return run(side);
		if (Math.abs(dx) >= OPEN_AT && side) {
			dx = dx > 0 ? REST : -REST;
			if (closeOpen !== close) closeOpen?.();
			closeOpen = close;
			return;
		}
		close();
	}

	function run(act: SwipeSide) {
		// Slide out, act, and come back (the list removes the row if the action moves it).
		dx = dx >= 0 ? width || 400 : -(width || 400);
		if (closeOpen === close) closeOpen = null;
		setTimeout(() => {
			act.run();
			dx = 0;
		}, 180);
	}

	function swallow() {
		swallowClick = true;
		setTimeout(() => (swallowClick = false), 50);
	}

	function cancel() {
		start = null;
		dragging = false;
		if (Math.abs(dx) !== REST) close();
	}
</script>

<div class="relative overflow-hidden rounded-xl">
	{#if dx !== 0 && side}
		<!-- The whole card's shape in the action's color: it shows behind the row's rounded corners
		     too, so the edges meet with no gap. The part that the row leaves free is the button. -->
		<div class={cn('absolute inset-0', side.tone)} aria-hidden="true"></div>
		<button
			type="button"
			class={cn(
				'absolute inset-y-0 flex items-center gap-2 overflow-hidden px-4 text-sm font-medium whitespace-nowrap',
				side.tone,
				dx > 0 ? 'left-0 justify-start' : 'right-0 justify-end',
				resting && 'justify-center',
				!dragging && 'transition-[width] duration-200'
			)}
			style:width="{Math.abs(dx)}px"
			tabindex={resting ? 0 : -1}
			aria-label={side.label}
			onclick={() => side && run(side)}
		>
			<side.icon class={cn('size-5 shrink-0 transition-transform', acts && 'scale-110')} />
			{#if Math.abs(dx) >= 72}<span>{side.label}</span>{/if}
		</button>
	{/if}
	<!-- The row inside has its role; the same actions are in its menu and on the keys. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={el}
		class={cn(
			'relative touch-pan-y rounded-xl',
			dx !== 0 && 'bg-background',
			!dragging && 'transition-transform duration-200'
		)}
		style:transform={dx ? `translateX(${dx}px)` : undefined}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={cancel}
		onclickcapture={(e) => {
			if (swallowClick) {
				e.stopPropagation();
				e.preventDefault();
			}
		}}
	>
		{@render children()}
	</div>
</div>
