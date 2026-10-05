<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { ListDrag } from '$lib/drag.svelte';
	import { cn } from '$lib/utils';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	let {
		items,
		key,
		onchange,
		row,
		ghost,
		label,
		class: className = '',
		rowClass = ''
	}: {
		items: T[];
		key: (item: T) => string;
		onchange: (items: T[]) => void;
		row: Snippet<[T, number, Snippet]>;
		ghost: Snippet<[T]>;
		label: string;
		class?: string;
		rowClass?: string | ((item: T) => string);
	} = $props();

	const PLACEHOLDER = '__placeholder';
	const FLIP = { duration: 220, easing: cubicOut };
	const GAP_MOTION = { duration: 180, easing: cubicOut };

	function moveTo(from: number, to: number) {
		if (to < 0 || to >= items.length) return;
		const next = [...items];
		const [x] = next.splice(from, 1);
		next.splice(to, 0, x);
		onchange(next);
	}

	const drag = new ListDrag({
		enabled: () => true,
		pick: (id) => [id],
		isCollapsed: () => false,
		drop: (ids, _zone, index) => {
			const moving = items.filter((i) => ids.includes(key(i)));
			const left = items.filter((i) => !ids.includes(key(i)));
			left.splice(index, 0, ...moving);
			onchange(left);
		}
	});

	const shown = $derived.by(() => {
		const list: { id: string; item: T | null }[] = items
			.filter((i) => !drag.ids.includes(key(i)))
			.map((i) => ({ id: key(i), item: i }));
		if (drag.active)
			list.splice(Math.min(drag.index, list.length), 0, { id: PLACEHOLDER, item: null });
		return list;
	});

	function gapIn(node: Element, r: { item: T | null }) {
		if (r.item) return { duration: 0 };
		return drag.fresh ? { duration: 0 } : slide(node, GAP_MOTION);
	}
	function gapOut(node: Element, r: { item: T | null }) {
		if (r.item) return drag.active || drag.settling ? { duration: 0 } : slide(node, GAP_MOTION);
		return drag.settling ? { duration: 0 } : slide(node, GAP_MOTION);
	}

	function onHandleKey(e: KeyboardEvent, index: number) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const id = key(items[index]);
		moveTo(index, index + (e.key === 'ArrowUp' ? -1 : 1));
		requestAnimationFrame(() =>
			document
				.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"] [data-drag-handle]`)
				?.focus()
		);
	}
</script>

<div data-drag-root>
	<section data-drag-zone="list">
		<ul class={cn('relative grid grid-cols-[minmax(0,1fr)] gap-2', className)} aria-label={label}>
			{#each shown as r (r.id)}
				<li
					animate:flip={FLIP}
					in:gapIn={r}
					out:gapOut={r}
					data-drag-id={r.item ? r.id : undefined}
					data-drag-placeholder={!r.item || undefined}
					style={r.item ? undefined : `height: ${drag.gap}px`}
					class={r.item
						? cn('drag-row', typeof rowClass === 'function' ? rowClass(r.item) : rowClass)
						: 'rounded-lg border-2 border-dashed border-primary/25 bg-primary/[0.05]'}
					onpointerdown={(e) => r.item && drag.pointerdown(e, r.id, e.currentTarget)}
				>
					{#if r.item}
						{@const index = items.indexOf(r.item)}
						{#snippet handle()}
							<button
								type="button"
								data-drag-handle
								class="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
								aria-label="Reorder: drag, or press ↑ ↓"
								onkeydown={(e) => onHandleKey(e, index)}><GripVertical class="size-4" /></button
							>
						{/snippet}
						{@render row(r.item, index, handle)}
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</div>

{#if drag.active}
	{@const item = items.find((i) => key(i) === drag.ids[0])}
	{@const lift = drag.lift.current}
	<div
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; transform-origin: {drag.grab.x}px {drag.grab
			.y}px; transform: translate3d({drag.pos.current.x}px, {drag.pos.current.y}px, 0) scale({1 -
			0.03 * lift});"
	>
		<div
			class="rounded-lg border bg-background"
			style="box-shadow: 0 {6 + 16 * lift}px {18 + 30 * lift}px -{10 -
				2 * lift}px rgb(0 0 0 / {0.12 + 0.22 * lift});"
		>
			{#if item}{@render ghost(item)}{/if}
		</div>
	</div>
{/if}
