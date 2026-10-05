<script lang="ts" generics="T extends { key: string }">
	import type { Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { ListDrag } from '$lib/drag.svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	/**
	 * A list you reorder by drag (with the dashboards' lift and spring), or with ↑ ↓ on the grip.
	 * Used by Settings → Menus and the notification views.
	 */
	let {
		items,
		onchange,
		row,
		actions,
		label,
		empty = 'Nothing here.'
	}: {
		items: T[];
		onchange: (items: T[]) => void;
		/** The row's content. */
		row: Snippet<[T]>;
		/** Buttons at the end of the row, for example Remove. */
		actions?: Snippet<[T, number]>;
		label: string;
		empty?: string;
	} = $props();

	function move(from: number, to: number) {
		if (to < 0 || to >= items.length) return;
		const next = [...items];
		const [x] = next.splice(from, 1);
		next.splice(to, 0, x);
		onchange(next);
	}

	function onHandleKey(e: KeyboardEvent, item: T, k: number) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		move(k, k + (e.key === 'ArrowUp' ? -1 : 1));
		requestAnimationFrame(() =>
			document
				.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(item.key)}"] [data-drag-handle]`)
				?.focus()
		);
	}

	const drag = new ListDrag({
		enabled: () => true,
		pick: (key) => [key],
		isCollapsed: () => false,
		drop: (keys, _zone, index) => {
			const moving = items.filter((i) => keys.includes(i.key));
			const left = items.filter((i) => !keys.includes(i.key));
			left.splice(index, 0, ...moving);
			onchange(left);
		}
	});

	/** The dragged row leaves the list, and a gap opens where it will land. */
	const shown = $derived.by(() => {
		const list: { key: string; item: T | null }[] = items
			.filter((i) => !drag.ids.includes(i.key))
			.map((i) => ({ key: i.key, item: i }));
		if (drag.active)
			list.splice(Math.min(drag.index, list.length), 0, { key: '__placeholder', item: null });
		return list;
	});
	const FLIP = { duration: 220, easing: cubicOut };
	function enter(node: Element, r: { item: T | null }) {
		if (!r.item)
			return drag.fresh ? { duration: 0 } : slide(node, { duration: 180, easing: cubicOut });
		return drag.active || drag.settling ? { duration: 0 } : fly(node, { y: -6, duration: 180 });
	}
	function leave(node: Element, r: { item: T | null }) {
		if (!r.item)
			return drag.settling ? { duration: 0 } : slide(node, { duration: 180, easing: cubicOut });
		return drag.active || drag.settling
			? { duration: 0 }
			: slide(node, { duration: 180, easing: cubicOut });
	}
</script>

{#snippet line(item: T, k: number)}
	<div
		class="flex min-w-0 cursor-grab items-center gap-2 px-1.5 py-1 text-sm active:cursor-grabbing"
	>
		<button
			type="button"
			data-drag-handle
			class="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
			aria-label="Reorder: drag, or press ↑ ↓"
			tabindex={k < 0 ? -1 : 0}
			onkeydown={(e) => onHandleKey(e, item, k)}><GripVertical class="size-4" /></button
		>
		<div class="flex min-w-0 flex-1 items-center gap-2">{@render row(item)}</div>
		<span class="flex shrink-0 items-center" data-no-drag>
			{#if actions && k >= 0}{@render actions(item, k)}{/if}
		</span>
	</div>
{/snippet}

<div data-drag-root>
	<section data-drag-zone="list">
		<ul class="relative grid grid-cols-[minmax(0,1fr)] gap-0.5" aria-label={label}>
			{#each shown as r (r.key)}
				<li
					animate:flip={FLIP}
					in:enter={r}
					out:leave={r}
					data-drag-id={r.item?.key}
					data-drag-placeholder={!r.item || undefined}
					style={r.item ? undefined : `height: ${drag.gap}px`}
					class={r.item
						? 'drag-row rounded-lg bg-card'
						: 'rounded-lg border-2 border-dashed border-primary/25 bg-primary/[0.05]'}
					onpointerdown={(e) => r.item && drag.pointerdown(e, r.item.key, e.currentTarget)}
				>
					{#if r.item}{@render line(r.item, items.indexOf(r.item))}{/if}
				</li>
			{/each}
			{#if !items.length}
				<li class="px-2 py-3 text-sm text-muted-foreground">{empty}</li>
			{/if}
		</ul>
	</section>
</div>

{#if drag.active}
	{@const item = items.find((i) => i.key === drag.ids[0])}
	{@const lift = drag.lift.current}
	<!-- The row under the pointer, lifted (the same look as a dragged PR card). -->
	<div
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; transform-origin: {drag.grab.x}px {drag.grab
			.y}px; transform: translate3d({drag.pos.current.x}px, {drag.pos.current.y}px, 0) scale({1 -
			0.04 * lift});"
	>
		<div
			class="rounded-lg border bg-background"
			style="box-shadow: 0 {6 + 16 * lift}px {18 + 30 * lift}px -{10 -
				2 * lift}px rgb(0 0 0 / {0.12 + 0.22 * lift});"
		>
			{#if item}{@render line(item, -1)}{/if}
		</div>
	</div>
{/if}
