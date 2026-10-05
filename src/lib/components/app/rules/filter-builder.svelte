<script lang="ts">
	import type { BuilderField } from '$lib/shared/rule-builder';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import RuleBuilder, { type RulePreview } from './rule-builder.svelte';
	import ListFilter from '@lucide/svelte/icons/list-filter';

	let {
		value = $bindable(''),
		id,
		exclude = [],
		suggestions = {},
		preview
	}: {
		value: string;
		id: string;
		exclude?: string[];
		suggestions?: Partial<Record<NonNullable<BuilderField['suggest']>, string[]>>;
		preview?: (query: string) => RulePreview | null;
	} = $props();

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
		aria-label="Build a filter"
		title="Build a filter"
	>
		<ListFilter class="size-3.5" />
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[min(36rem,calc(100vw-2rem))] p-3">
		{#if open}
			<RuleBuilder
				bind:value
				{id}
				label="Filter"
				{exclude}
				{suggestions}
				{preview}
				templates={[]}
			/>
			<div class="mt-2 flex justify-end gap-2">
				{#if value.trim()}
					<Button variant="ghost" size="sm" onclick={() => (value = '')}>Clear</Button>
				{/if}
				<Button size="sm" onclick={() => (open = false)}>Done</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
