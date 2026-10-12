<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		href,
		class: className,
		title,
		style,
		insideRow = false,
		children
	}: {
		href: string;
		class?: string;
		title?: string;
		style?: string;
		insideRow?: boolean;
		children: Snippet;
	} = $props();
</script>

<a
	{href}
	{title}
	{style}
	tabindex={insideRow ? -1 : undefined}
	target="_blank"
	rel="noreferrer"
	class={cn('underline-offset-2 hover:text-foreground hover:underline', className)}
	onclick={(e) => insideRow && e.stopPropagation()}>{@render children()}</a
>
