<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { FeedDTO, ItemView } from '$lib/shared/types';
	import { MAX_VIEW_NAME_CHARS, MAX_VIEW_SEARCHES, searchKinds } from '$lib/shared/item-views';
	import { viewFeedView } from '$lib/shared/views';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Switch } from '$lib/components/ui/switch';
	import SearchBuilder from './rules/search-builder.svelte';
	import SearchSize from './search-size.svelte';
	import FeedButton from './feed-button.svelte';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { cn } from '$lib/utils';

	let {
		view = $bindable(),
		first,
		last,
		hasFeed,
		previewTeam,
		feeds,
		onmove,
		ondelete
	}: {
		view: ItemView;
		first: boolean;
		last: boolean;
		hasFeed: boolean;
		previewTeam: string | null;
		feeds: FeedDTO[] | undefined;
		onmove: (by: number) => void;
		ondelete: () => void;
	} = $props();

	let openSearch = $state<number | null>(untrack(() => (hasFeed ? null : 0)));
	const DRAWER = { duration: 180, easing: cubicOut };

	const toggleSearch = (index: number) => (openSearch = openSearch === index ? null : index);

	function removeSearch(index: number) {
		view.searches = view.searches.filter((_, k) => k !== index);
		openSearch = null;
	}

	function addSearch() {
		view.searches = [...view.searches, 'is:open'];
		const index = view.searches.length - 1;
		openSearch = index;
		void tick().then(() =>
			document
				.querySelector<HTMLElement>(`[data-search="${view.id}-${index}"] :is(input, textarea)`)
				?.focus()
		);
	}

	function onGitHub(query: string) {
		const q = query.replaceAll('@team', previewTeam ?? '');
		const type = searchKinds(query).includes('issue') ? 'issues' : 'pullrequests';
		return `https://github.com/search?type=${type}&q=${encodeURIComponent(q)}`;
	}
</script>

<Card.Root id="view-{view.id}" class="scroll-mt-20">
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<Input
				bind:value={view.name}
				data-view={view.id}
				aria-label="View name"
				maxlength={MAX_VIEW_NAME_CHARS}
				class="h-8 max-w-60 font-semibold"
			/>
		</Card.Title>
		<Card.Action class="row-span-1 flex items-center gap-0.5">
			{#if hasFeed}
				<FeedButton view={viewFeedView(view.id)} name={view.name} {feeds} />
			{/if}
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Move {view.name} up"
				disabled={first}
				onclick={() => onmove(-1)}><ArrowUp /></Button
			>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Move {view.name} down"
				disabled={last}
				onclick={() => onmove(1)}><ArrowDown /></Button
			>
			<Button
				variant="ghost"
				size="icon-xs"
				class="text-destructive"
				aria-label="Delete {view.name}"
				onclick={ondelete}><Trash /></Button
			>
		</Card.Action>
	</Card.Header>
	<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-4">
		<div class="grid grid-cols-[minmax(0,1fr)] gap-2">
			<p class="text-xs font-medium text-muted-foreground">Searches</p>
			{#each view.searches as query, index (index)}
				{@const expanded = openSearch === index}
				<div class={cn('rounded-lg border', expanded && 'bg-muted/30')}>
					<div class="flex items-center gap-1 p-1.5">
						<button
							type="button"
							class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
							aria-expanded={expanded}
							aria-controls="view-{view.id}-search-{index}-details"
							onclick={() => toggleSearch(index)}
						>
							<span class="block truncate font-mono text-xs">{query || 'No search yet'}</span>
						</button>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-xs"
										href={onGitHub(view.searches[index])}
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
							aria-label="Remove this search"
							onclick={() => removeSearch(index)}><X /></Button
						>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={expanded ? 'Close this search' : 'Edit this search'}
							onclick={() => toggleSearch(index)}
							><ChevronDown class={cn('transition-transform', expanded && 'rotate-180')} /></Button
						>
					</div>
					{#if expanded}
						<div
							id="view-{view.id}-search-{index}-details"
							class="grid grid-cols-[minmax(0,1fr)] gap-2 border-t p-2.5"
							data-search="{view.id}-{index}"
							transition:slide={DRAWER}
						>
							<SearchBuilder bind:value={view.searches[index]} id="view-{view.id}-search-{index}" />
							<SearchSize query={view.searches[index]} />
						</div>
					{/if}
				</div>
			{/each}
			<div>
				<Button
					variant="outline"
					size="sm"
					onclick={addSearch}
					disabled={view.searches.length >= MAX_VIEW_SEARCHES}><Plus /> Add search</Button
				>
			</div>
		</div>
		<label class="flex items-start justify-between gap-4 border-t pt-4">
			<span class="grid gap-0.5">
				<span class="text-sm font-medium">Push new items</span>
				<span class="text-xs text-muted-foreground"
					>A push when a pull request or issue shows up in this view for the first time. Items that
					you opened do not push.</span
				>
			</span>
			<Switch
				bind:checked={() => view.pushNew ?? false, (on) => (view.pushNew = on || undefined)}
				aria-label="Push new items in {view.name}"
			/>
		</label>
	</Card.Content>
</Card.Root>
