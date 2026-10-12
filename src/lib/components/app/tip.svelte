<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		text,
		focusable = true,
		children
	}: {
		text: string | null | undefined;
		focusable?: boolean;
		children: Snippet<[Record<string, unknown>]>;
	} = $props();
</script>

{#if text}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(focusable ? props : { ...props, tabindex: undefined })}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{text}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render children({})}
{/if}
