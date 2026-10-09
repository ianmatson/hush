<script lang="ts">
	import type { CategoryGroup } from '$lib/shared/types';
	import { allCategories } from '$lib/shared/categories';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import MarkIcon from './mark-icon.svelte';
	import Shapes from '@lucide/svelte/icons/shapes';
	import Check from '@lucide/svelte/icons/check';
	import Settings2 from '@lucide/svelte/icons/settings-2';

	let {
		groups,
		count,
		value = $bindable(null)
	}: {
		groups: CategoryGroup[];
		count: (id: string) => number;
		value?: string | null;
	} = $props();

	const active = $derived(allCategories(groups).find((c) => c.id === value) ?? null);
	const shownGroups = $derived(groups.filter((g) => g.categories.length));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={active ? 'secondary' : 'ghost'}
				size={active ? 'sm' : 'icon-sm'}
				aria-label={active ? `Category: ${active.name}` : 'Filter by category'}
				title={active ? undefined : 'Filter by category'}
			>
				{#if active}
					<MarkIcon color={active.color} icon={active.icon} class="size-3.5" />
					<span class="max-w-28 truncate">{active.name}</span>
				{:else}
					<Shapes />
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="max-h-[70vh] w-60 overflow-y-auto">
		<DropdownMenu.Item onclick={() => (value = null)}>
			<span class="flex-1">Every category</span>
			{#if !active}<Check class="size-3.5" />{/if}
		</DropdownMenu.Item>
		{#each shownGroups as g (g.id)}
			<DropdownMenu.Separator />
			<DropdownMenu.Label>{g.name}</DropdownMenu.Label>
			{#each g.categories as c (c.id)}
				{@const n = count(c.id)}
				<DropdownMenu.Item
					class={cn(!n && c.id !== value && 'opacity-50')}
					onclick={() => (value = value === c.id ? null : c.id)}
				>
					<MarkIcon color={c.color} icon={c.icon} class="size-3.5" />
					<span class="flex-1 truncate">{c.name}</span>
					<span class="text-xs text-muted-foreground tabular-nums">{n}</span>
					{#if c.id === value}<Check class="size-3.5" />{/if}
				</DropdownMenu.Item>
			{/each}
		{:else}
			<p class="px-2 py-1.5 text-xs text-muted-foreground">No categories yet.</p>
		{/each}
		<DropdownMenu.Separator />
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href="/settings/categories"><Settings2 />Edit categories</a>
			{/snippet}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
