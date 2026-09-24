<script lang="ts">
	import type { Snippet } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cn } from '$lib/utils';
	import Check from '@lucide/svelte/icons/check';

	/**
	 * The row's icon or avatar. It turns into a checkbox on hover, and it stays one while
	 * any row is selected (like Gmail).
	 */
	let {
		checked,
		selecting,
		label,
		ontoggle,
		children
	}: {
		checked: boolean;
		selecting: boolean;
		label: string;
		ontoggle: (e: MouseEvent) => void;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	aria-label={label}
	class="group/mark relative mt-0.5 size-8 shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
	onclick={(e) => {
		e.stopPropagation();
		ontoggle(e);
	}}
>
	<span
		class={cn(
			'block transition-opacity duration-150',
			(checked || selecting) && 'opacity-0',
			'group-hover/mark:opacity-0'
		)}
	>
		{@render children()}
	</span>
	<span
		class={cn(
			'absolute inset-0 flex items-center justify-center rounded-full border-2 transition-all duration-150',
			checked
				? 'border-primary bg-primary text-primary-foreground'
				: 'border-muted-foreground/40 bg-background opacity-0 group-hover/mark:opacity-100',
			selecting && !checked && 'opacity-100'
		)}
	>
		{#if checked}
			<span in:scale={{ duration: 150, start: 0.5 }}><Check class="size-4" strokeWidth={3} /></span>
		{/if}
	</span>
</button>
