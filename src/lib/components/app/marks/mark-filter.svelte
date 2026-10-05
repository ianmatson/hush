<script lang="ts">
	import type { MarkColor } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import MarkIcon from './mark-icon.svelte';
	import Shapes from '@lucide/svelte/icons/shapes';
	import Tag from '@lucide/svelte/icons/tag';
	import Check from '@lucide/svelte/icons/check';
	import Settings2 from '@lucide/svelte/icons/settings-2';

	interface FilterMark {
		id: string;
		name: string;
		color: MarkColor;
		icon?: string;
	}

	let {
		kind,
		marks,
		count,
		value = $bindable(null)
	}: {
		kind: 'category' | 'tag';
		marks: FilterMark[];
		count: (id: string) => number;
		value?: string | null;
	} = $props();

	const noun = $derived(kind === 'category' ? 'Category' : 'Tag');
	const active = $derived(marks.find((m) => m.id === value) ?? null);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant={active ? 'secondary' : 'ghost'}
				size={active ? 'sm' : 'icon-sm'}
				aria-label={active ? `${noun}: ${active.name}` : `Filter by ${noun.toLowerCase()}`}
				title={active ? undefined : `Filter by ${noun.toLowerCase()}`}
			>
				{#if active}
					<MarkIcon {kind} color={active.color} icon={active.icon} class="size-3.5" />
					<span class="max-w-28 truncate">{active.name}</span>
				{:else if kind === 'category'}
					<Shapes />
				{:else}
					<Tag />
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60">
		<DropdownMenu.Label>Filter by {noun.toLowerCase()}</DropdownMenu.Label>
		<DropdownMenu.Item onclick={() => (value = null)}>
			<span class="flex-1">{kind === 'category' ? 'Every category' : 'Any tags'}</span>
			{#if !active}<Check class="size-3.5" />{/if}
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		{#each marks as m (m.id)}
			{@const n = count(m.id)}
			<DropdownMenu.Item
				class={cn(!n && m.id !== value && 'opacity-50')}
				onclick={() => (value = value === m.id ? null : m.id)}
			>
				<MarkIcon {kind} color={m.color} icon={m.icon} class="size-3.5" />
				<span class="flex-1 truncate">{m.name}</span>
				<span class="text-xs text-muted-foreground tabular-nums">{n}</span>
				{#if m.id === value}<Check class="size-3.5" />{/if}
			</DropdownMenu.Item>
		{:else}
			<p class="px-2 py-1.5 text-xs text-muted-foreground">No {noun.toLowerCase()}s yet.</p>
		{/each}
		<DropdownMenu.Separator />
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href="/settings/categories#{kind === 'category' ? 'categories' : 'tags'}"
					><Settings2 />Edit {kind === 'category' ? 'categories' : 'tags'}</a
				>
			{/snippet}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
