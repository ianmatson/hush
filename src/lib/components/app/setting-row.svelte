<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '$lib/components/ui/label';

	let {
		id,
		label,
		description,
		children
	}: { id?: string; label: string; description?: string; children: Snippet } = $props();
</script>

<div class="flex items-center justify-between gap-6 py-3">
	<Label for={id} class="grid gap-0.5">
		<span>{label}</span>
		{#if description}<span class="text-xs font-normal text-muted-foreground">{description}</span
			>{/if}
	</Label>
	<div class="shrink-0">{@render children()}</div>
</div>
