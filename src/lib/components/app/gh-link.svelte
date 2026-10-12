<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		href,
		class: className,
		style,
		insideRow = false,
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, 'href' | 'class' | 'style' | 'children'> & {
		href: string;
		class?: string;
		style?: string;
		insideRow?: boolean;
		children: Snippet;
	} = $props();
</script>

<a
	{...rest}
	{href}
	{style}
	tabindex={insideRow ? -1 : undefined}
	target="_blank"
	rel="noreferrer"
	class={cn('underline-offset-2 hover:text-foreground hover:underline', className)}
	onclick={(e) => insideRow && e.stopPropagation()}>{@render children()}</a
>
