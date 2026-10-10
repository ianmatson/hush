<script lang="ts">
	import type { CategoryGroup } from '$lib/shared/types';
	import { allCategories, type CategoryFilter } from '$lib/shared/categories';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import MarkIcon from './mark-icon.svelte';
	import Shapes from '@lucide/svelte/icons/shapes';
	import Check from '@lucide/svelte/icons/check';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Settings2 from '@lucide/svelte/icons/settings-2';

	let {
		groups,
		count,
		value = $bindable(null)
	}: {
		groups: CategoryGroup[];
		count: (filter: CategoryFilter) => number;
		value?: CategoryFilter | null;
	} = $props();

	const activeCategory = $derived.by(() => {
		const id = value && 'category' in value ? value.category : null;
		return allCategories(groups).find((c) => c.id === id) ?? null;
	});
	const notSortedGroup = $derived.by(() => {
		const id = value && 'notSortedIn' in value ? value.notSortedIn : null;
		return groups.find((g) => g.id === id) ?? null;
	});
	const activeLabel = $derived(
		activeCategory?.name ?? (notSortedGroup ? `${notSortedGroup.name}: Not sorted` : null)
	);
	const shownGroups = $derived(groups.filter((g) => g.categories.length));
	const isCategory = (id: string) => !!value && 'category' in value && value.category === id;
	const isNotSorted = (groupId: string) =>
		!!value && 'notSortedIn' in value && value.notSortedIn === groupId;
	const toggle = (filter: CategoryFilter, on: boolean) => (value = on ? null : filter);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={activeLabel ? 'secondary' : 'ghost'}
				size={activeLabel ? 'sm' : 'icon-sm'}
				aria-label={activeLabel ? `Category: ${activeLabel}` : 'Filter by category'}
				title={activeLabel ? undefined : 'Filter by category'}
			>
				{#if activeCategory}
					<MarkIcon color={activeCategory.color} icon={activeCategory.icon} class="size-3.5" />
				{:else if notSortedGroup}
					<CircleDashed class="size-3.5 text-muted-foreground" />
				{:else}
					<Shapes />
				{/if}
				{#if activeLabel}<span class="max-w-36 truncate">{activeLabel}</span>{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="max-h-[70vh] w-60 overflow-y-auto">
		<DropdownMenu.Item onclick={() => (value = null)}>
			<span class="flex-1">Every category</span>
			{#if !activeLabel}<Check class="size-3.5" />{/if}
		</DropdownMenu.Item>
		{#each shownGroups as g (g.id)}
			<DropdownMenu.Separator />
			<DropdownMenu.Label>{g.name}</DropdownMenu.Label>
			{#each g.categories as c (c.id)}
				{@const n = count({ category: c.id })}
				{@const on = isCategory(c.id)}
				<DropdownMenu.Item
					class={cn(!n && !on && 'opacity-50')}
					onclick={() => toggle({ category: c.id }, on)}
				>
					<MarkIcon color={c.color} icon={c.icon} class="size-3.5" />
					<span class="flex-1 truncate">{c.name}</span>
					<span class="text-xs text-muted-foreground tabular-nums">{n}</span>
					{#if on}<Check class="size-3.5" />{/if}
				</DropdownMenu.Item>
			{/each}
			{@const unsorted = count({ notSortedIn: g.id })}
			{@const on = isNotSorted(g.id)}
			{#if unsorted || on}
				<DropdownMenu.Item onclick={() => toggle({ notSortedIn: g.id }, on)}>
					<CircleDashed class="size-3.5 text-muted-foreground" />
					<span class="flex-1 truncate">Not sorted</span>
					<span class="text-xs text-muted-foreground tabular-nums">{unsorted}</span>
					{#if on}<Check class="size-3.5" />{/if}
				</DropdownMenu.Item>
			{/if}
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
