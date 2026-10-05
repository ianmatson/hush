<script lang="ts">
	import type { DashSection } from '$lib/shared/types';
	import { MAX_SOURCES, sourceKinds } from '$lib/shared/sources';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { tick } from 'svelte';
	import { cn } from '$lib/utils';
	import SearchBuilder from './rules/search-builder.svelte';

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

	function move(i: number, d: number) {
		const next = [...sections];
		[next[i], next[i + d]] = [next[i + d], next[i]];
		sections = next;
	}

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

<ul class="grid gap-1.5">
	{#each sections as s, i (s.id)}
		{@const expanded = openSource === s.id}
		<li class={cn('rounded-lg border', expanded && 'bg-muted/30')}>
			<div class="flex items-center gap-1.5 p-1.5">
				<Switch bind:checked={s.enabled} aria-label="Show {s.name}" class="mx-1" />
				<button
					type="button"
					class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
					aria-expanded={expanded}
					aria-controls="source-{s.id}-details"
					onclick={() => (openSource = expanded ? null : s.id)}
				>
					<span
						class={cn('block truncate text-sm font-medium', !s.enabled && 'text-muted-foreground')}
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
					aria-label="Move up"
					disabled={i === 0}
					onclick={() => move(i, -1)}><ArrowUp /></Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Move down"
					disabled={i === sections.length - 1}
					onclick={() => move(i, 1)}><ArrowDown /></Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={expanded ? `Close ${s.name}` : `Edit ${s.name}`}
					onclick={() => (openSource = expanded ? null : s.id)}
					><ChevronDown class={cn('transition-transform', expanded && 'rotate-180')} /></Button
				>
			</div>
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
				</div>
			{/if}
		</li>
	{/each}
</ul>
<div>
	<Button variant="outline" size="sm" onclick={add} disabled={sections.length >= MAX_SOURCES}
		><Plus /> Add source</Button
	>
</div>
