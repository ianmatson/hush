<script lang="ts">
	import type { DashSection } from '$lib/shared/types';
	import { MAX_SOURCES, sourceKinds } from '$lib/shared/sources';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { tick, type Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import SearchBuilder from './rules/search-builder.svelte';
	import SourceSize from './source-size.svelte';
	import ReorderList from './reorder-list.svelte';

	let {
		sections = $bindable(),
		scope,
		previewTeam
	}: {
		sections: DashSection[];
		scope: string;
		previewTeam: string | null;
	} = $props();

	let openSource = $state<string | null>(null);
	const DRAWER = { duration: 180, easing: cubicOut };

	function add() {
		const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
		sections = [...sections, { id, name: 'New source', query: 'is:open', enabled: true }];
		openSource = id;
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-source="${id}"]`)?.focus()
		);
	}

	/** Open the same search on GitHub, to check a query. */
	function preview(s: DashSection) {
		let q = [s.query, scope].filter(Boolean).join(' ');
		if (q.includes('@team')) q = q.replaceAll('@team', previewTeam ?? '');
		const type = sourceKinds(s.query).includes('issue') ? 'issues' : 'pullrequests';
		return `https://github.com/search?type=${type}&q=${encodeURIComponent(q)}`;
	}
</script>

{#snippet sourceHeader(s: DashSection, handle: Snippet | null)}
	{@const expanded = openSource === s.id}
	<div class="flex items-center gap-1.5 p-1.5">
		{#if handle}
			{@render handle()}
		{:else}
			<span class="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60"
				><GripVertical class="size-4" /></span
			>
		{/if}
		<Switch bind:checked={s.enabled} aria-label="Show {s.name}" class="mx-1" />
		<button
			type="button"
			class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
			aria-expanded={expanded}
			aria-controls="source-{s.id}-details"
			onclick={() => (openSource = expanded ? null : s.id)}
		>
			<span class={cn('block truncate text-sm font-medium', !s.enabled && 'text-muted-foreground')}
				>{s.name || 'Untitled'}</span
			>
			<span class="block truncate font-mono text-[0.7rem] text-muted-foreground"
				>{s.query || 'No search yet'}</span
			>
		</button>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-xs"
						href={preview(s)}
						target="_blank"
						rel="noreferrer"
						aria-label="Try on GitHub"><ExternalLink /></Button
					>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Try this search on GitHub</Tooltip.Content>
		</Tooltip.Root>
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={expanded ? `Close ${s.name}` : `Edit ${s.name}`}
			onclick={() => (openSource = expanded ? null : s.id)}
			><ChevronDown class={cn('transition-transform', expanded && 'rotate-180')} /></Button
		>
	</div>
{/snippet}

<ReorderList
	items={sections}
	key={(s) => s.id}
	label="Sources, in order"
	class="gap-1.5"
	rowClass={(s) => cn('rounded-lg border bg-card', openSource === s.id && 'bg-muted/30')}
	onchange={(ordered) => (sections = ordered)}
>
	{#snippet row(s, _index, handle)}
		{@const expanded = openSource === s.id}
		{@render sourceHeader(s, handle)}
		<div data-no-drag>
			{#if expanded}
				<div
					id="source-{s.id}-details"
					class="grid grid-cols-[minmax(0,1fr)] gap-2 border-t p-2.5"
					transition:slide={DRAWER}
				>
					<div class="flex items-center gap-2">
						<Input
							bind:value={s.name}
							aria-label="Source name"
							data-source={s.id}
							class="h-8 min-w-0 flex-1"
						/>
						<Button
							variant="ghost"
							size="sm"
							class="text-destructive"
							onclick={() => (sections = sections.filter((x) => x.id !== s.id))}
							><Trash /> Delete</Button
						>
					</div>
					<SearchBuilder bind:value={s.query} id="source-{s.id}-query" />
					<SourceSize query={s.query} {scope} />
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet ghost(s)}
		{@render sourceHeader(s, null)}
	{/snippet}
</ReorderList>
<div>
	<Button variant="outline" size="sm" onclick={add} disabled={sections.length >= MAX_SOURCES}
		><Plus /> Add source</Button
	>
</div>
