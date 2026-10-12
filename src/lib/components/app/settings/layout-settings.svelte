<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_ROW_LAYOUT, ROW_LAYOUTS, type RowLayout } from '$lib/shared/row-layout';
	import { cn } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import RowSettings from './row-settings.svelte';
	import TableSettings from './table-settings.svelte';

	const me = createQuery(meQuery);
	const layout = $derived(me.data?.settings.rowLayout ?? DEFAULT_ROW_LAYOUT);

	const CARD_SKETCH = [
		[0.85, 0.55, 0.4],
		[0.7, 0.5, 0.3]
	];
	const TABLE_SKETCH = [0.9, 0.7, 0.8, 0.6, 0.75];

	function choose(next: RowLayout) {
		if (next !== layout) saveSettings({ rowLayout: next });
	}
</script>

{#snippet sketch(id: RowLayout)}
	<span
		class="flex h-16 flex-col justify-center gap-1.5 rounded-md border bg-background px-2"
		aria-hidden="true"
	>
		{#if id === 'cards'}
			{#each CARD_SKETCH as lines, card (card)}
				<span class="flex gap-1.5">
					<span class="size-2.5 shrink-0 rounded-full bg-muted-foreground/30"></span>
					<span class="flex flex-1 flex-col gap-0.5">
						{#each lines as width, line (line)}
							<span
								class={cn(
									'h-1 rounded-full',
									line ? 'bg-muted-foreground/20' : 'bg-muted-foreground/40'
								)}
								style:width="{width * 100}%"
							></span>
						{/each}
					</span>
				</span>
			{/each}
		{:else}
			{#each TABLE_SKETCH as width, line (line)}
				<span class="flex items-center gap-1.5">
					<span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/30"></span>
					<span
						class="h-1 flex-1 rounded-full bg-muted-foreground/40"
						style:max-width="{width * 60}%"
					></span>
					<span class="h-1 w-3 rounded-full bg-muted-foreground/20"></span>
					<span class="h-1 w-2 rounded-full bg-muted-foreground/20"></span>
				</span>
			{/each}
		{/if}
	</span>
{/snippet}

<Card.Root id="row-layout">
	<Card.Header>
		<Card.Title>Row layout</Card.Title>
		<Card.Description>How the lists of pull requests and issues show each item.</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Row layout">
			{#each ROW_LAYOUTS as option (option.id)}
				<button
					type="button"
					role="radio"
					aria-checked={layout === option.id}
					class={cn(
						'grid gap-2 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
						layout === option.id && 'border-primary ring-1 ring-primary'
					)}
					onclick={() => choose(option.id)}
				>
					{@render sketch(option.id)}
					<span class="grid gap-0.5">
						<span class="text-sm font-medium">{option.label}</span>
						<span class="text-xs text-muted-foreground">{option.description}</span>
					</span>
				</button>
			{/each}
		</div>
	</Card.Content>
</Card.Root>

{#if layout === 'table'}
	<TableSettings />
{:else}
	<RowSettings />
{/if}
