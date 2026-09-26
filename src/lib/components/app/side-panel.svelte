<script lang="ts" module>
	// Panels docked now (the peek and the alert history can overlap while one slides out).
	let dockedCount = 0;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { ui } from '$lib/ui.svelte';
	import X from '@lucide/svelte/icons/x';

	/**
	 * The right-side panel of the peek and the alert history. Wide screens: docked on the right,
	 * and the page makes room, so the list stays usable. Narrow screens: a bottom sheet.
	 */
	let {
		open,
		onclose,
		label,
		title,
		start,
		actions,
		children,
		footer
	}: {
		open: boolean;
		onclose: () => void;
		/** The panel's accessible name (and the close button's). */
		label: string;
		/** The sheet's accessible title (narrow screens). */
		title: string;
		/** Left of the header bar (a back button; hints only when `wide`). */
		start?: Snippet<[wide: boolean]>;
		/** Buttons before the close button. */
		actions?: Snippet<[size: 'icon-sm' | 'icon']>;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const wide = new MediaQuery('min-width: 1024px');

	// Phones: swipe the sheet down by its top bar to close it (or tap the handle).
	const CLOSE_AT = 80;
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;
	function dragStart(e: PointerEvent) {
		// Buttons in the bar keep their clicks; the handle itself also drags.
		const target = e.target as Element;
		if (target.closest('button, a') && !target.closest('[data-sheet-handle]')) return;
		startY = e.clientY;
		dragging = true;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}
	function dragMove(e: PointerEvent) {
		if (dragging) dragY = Math.max(0, e.clientY - startY);
	}
	function dragEnd() {
		if (!dragging) return;
		dragging = false;
		if (dragY > CLOSE_AT) onclose();
		dragY = 0;
	}
	const docked = $derived(open && wide.current);

	function setDocked(on: boolean) {
		dockedCount = Math.max(0, dockedCount + (on ? 1 : -1));
		ui.peekDocked = dockedCount > 0;
		document.documentElement.classList.toggle('peek-docked', dockedCount > 0);
	}
	$effect(() => {
		if (!docked) return;
		setDocked(true);
		return () => setDocked(false);
	});
</script>

{#if open && wide.current}
	<aside
		class="fixed top-12 right-0 bottom-0 z-20 flex w-(--peek-w) flex-col border-l bg-background shadow-[-12px_0_32px_-24px_rgb(0_0_0/0.25)]"
		aria-label={label}
		transition:fly={{ x: 40, duration: 200, easing: cubicOut }}
	>
		<div class="flex h-11 shrink-0 items-center gap-1 border-b px-2">
			{@render start?.(true)}
			<span class="ml-auto flex items-center gap-1">
				{@render actions?.('icon-sm')}
				<Button variant="ghost" size="icon-sm" aria-label="Close {label}" onclick={onclose}
					><X /></Button
				>
			</span>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			{@render children()}
		</div>
		{#if footer}
			<div class="flex shrink-0 flex-wrap items-center gap-1 border-t p-2">{@render footer()}</div>
		{/if}
	</aside>
{:else}
	<Dialog.Root
		{open}
		onOpenChange={(o) => {
			if (!o) onclose();
		}}
	>
		<Dialog.Content
			showCloseButton={false}
			class="top-auto bottom-0 left-0 flex h-[88dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom"
			style={dragY ? `transform: translateY(${dragY}px); transition: none` : undefined}
		>
			<Dialog.Title class="sr-only">{title}</Dialog.Title>
			<!-- The top bar is the handle: drag it down to close. -->
			<div
				role="presentation"
				class="relative flex h-12 shrink-0 touch-none items-center gap-1 border-b px-2"
				onpointerdown={dragStart}
				onpointermove={dragMove}
				onpointerup={dragEnd}
				onpointercancel={dragEnd}
			>
				<div class="absolute left-2 flex items-center">
					{#if open}{@render start?.(false)}{/if}
				</div>
				<button
					type="button"
					data-sheet-handle
					aria-label="Close {label}"
					class="mx-auto flex h-6 w-16 items-center justify-center"
					onclick={onclose}
					><span class="h-1 w-10 rounded-full bg-muted-foreground/30"></span></button
				>
				<div class="absolute right-2 flex items-center">
					{#if open}{@render actions?.('icon')}{/if}
					<Button variant="ghost" size="icon" aria-label="Close {label}" onclick={onclose}
						><X /></Button
					>
				</div>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				{#if open}{@render children()}{/if}
			</div>
			{#if footer && open}
				<div class="flex shrink-0 flex-wrap items-center gap-1 border-t p-2">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
