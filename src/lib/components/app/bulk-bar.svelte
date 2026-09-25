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
		data-bulk-bar
		class="fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
		transition:fly={{ y: 24, duration: 220, easing: cubicOut }}
	>
		<div
			class="flex max-w-full items-center gap-0.5 rounded-xl border bg-popover/95 p-1.5 pl-3 text-sm shadow-lg backdrop-blur sm:gap-1"
			role="toolbar"
			aria-label="Actions for selected items"
		>
			<span class="mr-1 font-medium whitespace-nowrap tabular-nums sm:mr-2"
				>{count}<span class="hidden sm:inline"> selected</span></span
			>
			{@render children()}
			<span class="mx-1 h-5 w-px bg-border"></span>
			<Button variant="ghost" size="icon-sm" aria-label="Clear selection (Esc)" onclick={onclear}
				><X /></Button
			>
		</div>
	</div>
{/if}
