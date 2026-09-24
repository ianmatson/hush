<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';
	import { ui } from '$lib/ui.svelte';

	let { count, onclear, children }: { count: number; onclear: () => void; children: Snippet } =
		$props();

	$effect(() => {
		ui.bulkBarOpen = count > 0;
		return () => (ui.bulkBarOpen = false);
	});
</script>

{#if count > 0}
	<div
		class="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4"
		transition:fly={{ y: 24, duration: 220, easing: cubicOut }}
	>
		<div
			class="flex items-center gap-1 rounded-xl border bg-popover/95 p-1.5 pl-3 text-sm shadow-lg backdrop-blur"
			role="toolbar"
			aria-label="Actions for selected items"
		>
			<span class="mr-2 font-medium tabular-nums">{count} selected</span>
			{@render children()}
			<span class="mx-1 h-5 w-px bg-border"></span>
			<Button variant="ghost" size="icon-sm" aria-label="Clear selection (Esc)" onclick={onclear}
				><X /></Button
			>
		</div>
	</div>
{/if}
