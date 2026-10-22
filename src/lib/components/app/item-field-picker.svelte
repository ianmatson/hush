<script lang="ts" module>
	export interface FieldOption {
		value: string;
		label: string;
		detail?: string | null;
		color?: string;
		avatar?: string | null;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Tip from './tip.svelte';

	let {
		label,
		tip,
		options,
		selected,
		loading,
		error,
		full = false,
		fullReason = '',
		search = $bindable(''),
		open = $bindable(false),
		ontoggle,
		triggerClass,
		triggerLabel,
		trigger
	}: {
		label: string;
		tip: string;
		options: FieldOption[];
		selected: FieldOption[];
		loading: boolean;
		error: string | null;
		full?: boolean;
		fullReason?: string;
		search?: string;
		open?: boolean;
		ontoggle: (option: FieldOption, on: boolean) => void;
		triggerClass: string;
		triggerLabel?: string;
		trigger: Snippet;
	} = $props();

	let highlighted = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);

	const selectedValues = $derived(new Set(selected.map((o) => o.value.toLowerCase())));
	const isSelected = (o: FieldOption) => selectedValues.has(o.value.toLowerCase());
	const matchesSearch = (o: FieldOption) => {
		const words = search.trim().toLowerCase();
		return !words || o.label.toLowerCase().includes(words);
	};
	const shownSelected = $derived(selected.filter(matchesSearch));
	const others = $derived(options.filter((o) => !isSelected(o)));

	function setOpen(next: boolean) {
		open = next;
		if (!next) search = '';
	}

	function focusSearch(e: Event) {
		e.preventDefault();
		searchInput?.focus({ preventScroll: true });
	}
</script>

{#snippet row(o: FieldOption, on: boolean)}
	<Command.Item
		value={o.value}
		data-checked={on}
		aria-checked={on}
		disabled={!on && full}
		onSelect={() => ontoggle(o, !on)}
	>
		{#if o.color}
			<span
				class="size-3 shrink-0 rounded-full border"
				style="background: #{o.color}; border-color: #{o.color}"
			></span>
		{:else if o.avatar !== undefined}
			{#if o.avatar}
				<img src={o.avatar} alt="" class="size-5 shrink-0 rounded-full bg-muted" loading="lazy" />
			{:else}
				<span class="size-5 shrink-0 rounded-full bg-muted"></span>
			{/if}
		{/if}
		<span class="grid min-w-0">
			<span class="truncate">{o.label}</span>
			{#if o.detail}
				<span class="truncate text-xs text-muted-foreground">{o.detail}</span>
			{/if}
		</span>
	</Command.Item>
{/snippet}

<Popover.Root bind:open={() => open, setOpen}>
	<Tip text={tip}>
		{#snippet children(props)}
			<Popover.Trigger {...props} class={triggerClass} aria-label={triggerLabel ?? tip}
				>{@render trigger()}</Popover.Trigger
			>
		{/snippet}
	</Tip>
	<Popover.Content
		align="start"
		onOpenAutoFocus={focusSearch}
		class="w-72 gap-0 p-0"
		data-item-field-picker
	>
		<Command.Root bind:value={highlighted} {label} shouldFilter={false} disableInitialScroll>
			<Command.Input
				bind:ref={searchInput}
				bind:value={search}
				placeholder="Search…"
				aria-label="Search {label.toLowerCase()}"
			/>
			<Command.List class="max-h-72">
				{#if shownSelected.length}
					<Command.Group heading="Chosen" value="chosen">
						{#each shownSelected as o (o.value)}
							{@render row(o, true)}
						{/each}
					</Command.Group>
				{/if}
				{#if others.length}
					<Command.Group heading={search.trim() ? 'Results' : 'More'} value="others">
						{#each others as o (o.value)}
							{@render row(o, false)}
						{/each}
					</Command.Group>
				{/if}
				{#if loading && !others.length}
					<div class="grid gap-2 p-2">
						<Skeleton class="h-5 w-3/4" />
						<Skeleton class="h-5 w-1/2" />
					</div>
				{:else if error}
					<p class="px-2 py-4 text-center text-sm text-muted-foreground">{error}</p>
				{:else if !others.length && !shownSelected.length}
					<p class="px-2 py-4 text-center text-sm text-muted-foreground">
						{search.trim() ? `Nothing matches “${search.trim()}”.` : 'Nothing to choose.'}
					</p>
				{/if}
			</Command.List>
			{#if full && fullReason}
				<p class="border-t px-3 py-2 text-xs text-muted-foreground">{fullReason}</p>
			{/if}
		</Command.Root>
	</Popover.Content>
</Popover.Root>
