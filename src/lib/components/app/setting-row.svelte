<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '$lib/components/ui/label';

	let {
		id,
		label,
		description,
		children,
		extra
	}: {
		id?: string;
		label: string;
		description?: string;
		children: Snippet;
		extra?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
	<Label for={id} class="grid min-w-0 flex-1 basis-48 gap-0.5">
		<span>{label}</span>
		{#if description}<span class="text-xs font-normal text-muted-foreground">{description}</span
			>{/if}
	</Label>
	<div class="max-w-full shrink-0">{@render children()}</div>
	{#if extra}<div class="basis-full not-has-[*]:hidden">{@render extra()}</div>{/if}
</div>
