<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import type { ListView } from '$lib/api';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { parseQuery } from '$lib/shared/query';
	import { MAX_SAVED, searchItems } from '$lib/shared/search';
	import type { ItemDTO, SavedSearch } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import ItemList from '$lib/components/app/item-list.svelte';
	import QueryInput from '$lib/components/app/query-input.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import Search from '@lucide/svelte/icons/search';
	import BookmarkPlus from '@lucide/svelte/icons/bookmark-plus';
	import Pencil from '@lucide/svelte/icons/pencil';

	/**
	 * Every item Hush has, with the query language: ?q= is the query, ?in= what you did with it
	 * (done, snoozed, muted), and ?s= a saved search. Saved searches are tabs after the lanes.
	 */
	const me = createQuery(meQuery);
	const saved = $derived<SavedSearch | null>(
		me.data?.settings.saved.find((v) => v.id === page.url.searchParams.get('s')) ?? null
	);
	const SCOPES: { id: ListView; label: string }[] = [
		{ id: 'all', label: 'Everything' },
		{ id: 'done', label: 'Done' },
		{ id: 'snoozed', label: 'Snoozed' },
		{ id: 'muted', label: 'Muted' }
	];
	const scope = $derived<ListView>(
		(SCOPES.find((s) => s.id === page.url.searchParams.get('in'))?.id as ListView) ?? 'all'
	);
	let query = $state(page.url.searchParams.get('q') ?? '');
	let input = $state<HTMLInputElement | null>(null);
	// A saved search: its query is the box's text.
	$effect(() => {
		if (saved) query = saved.query;
	});
	onMount(() => input?.focus());

	const valid = $derived(!parseQuery(query).errors.length);
	const me_ = $derived(me.data?.login ?? '');
	const filter = (items: ItemDTO[]) =>
		valid && query.trim() ? searchItems(items, query, me_) : items;
	const group = (items: ItemDTO[]) => [{ key: 'all', label: null, items }];

	function setScope(id: ListView) {
		const url = new URL(page.url);
		if (id === 'all') url.searchParams.delete('in');
		else url.searchParams.set('in', id);
		goto(url.pathname + url.search, { replaceState: true, keepFocus: true, noScroll: true });
	}

	let editing = $state<{ id?: string; name: string; query: string } | null>(null);
	function startSave() {
		editing = saved ? { ...saved, query } : { name: query.trim().slice(0, 40), query };
	}
	async function saveSearch() {
		if (!editing || !me.data) return;
		const list = me.data.settings.saved;
		const next: SavedSearch = {
			id: editing.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12),
			name: editing.name.trim(),
			query: editing.query
		};
		const saved_ = editing.id ? list.map((v) => (v.id === next.id ? next : v)) : [...list, next];
		if (
			await saveSettings({ saved: saved_ }, editing.id ? 'Search saved' : `“${next.name}” added`)
		) {
			editing = null;
			goto(`/search?s=${next.id}`);
		}
	}
	async function deleteSearch() {
		if (!editing?.id || !me.data) return;
		const list = me.data.settings.saved.filter((v) => v.id !== editing!.id);
		if (await saveSettings({ saved: list }, 'Saved search deleted')) {
			editing = null;
			goto('/search');
		}
	}
</script>

<svelte:head><title>{saved ? `${saved.name} · Hush` : 'Search · Hush'}</title></svelte:head>

<main data-page class="mx-auto max-w-4xl px-4 pt-5 pb-24">
	<div class="mb-4 flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="text-lg font-semibold tracking-tight">{saved?.name ?? 'Search'}</h1>
			<p class="text-sm text-muted-foreground">
				Every item Hush has. Words, or <code class="text-xs">repo:</code>,
				<code class="text-xs">needs:</code>, <code class="text-xs">from:</code>,
				<code class="text-xs">in:waiting</code>…
			</p>
		</div>
		{#if saved}
			<Button variant="ghost" size="sm" onclick={startSave}><Pencil />Edit</Button>
		{/if}
	</div>

	<div class="mb-3 flex items-start gap-2">
		<div class="relative min-w-0 flex-1">
			<Search
				class="pointer-events-none absolute top-2.5 left-2.5 z-10 size-4 text-muted-foreground"
			/>
			<QueryInput
				bind:value={query}
				bind:ref={input}
				id="search"
				class="h-9 pl-8 font-mono text-sm"
				placeholder="repo:acme/* needs:review, or words"
			/>
		</div>
		{#if query.trim() && valid && !saved && (me.data?.settings.saved.length ?? 0) < MAX_SAVED}
			<Button variant="outline" size="sm" class="h-9" onclick={startSave}
				><BookmarkPlus />Save as a tab</Button
			>
		{/if}
	</div>

	<div class="mb-4 flex gap-1" role="radiogroup" aria-label="Show">
		{#each SCOPES as s (s.id)}
			<button
				type="button"
				role="radio"
				aria-checked={scope === s.id}
				class={cn(
					'rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground',
					scope === s.id && 'bg-muted text-foreground'
				)}
				onclick={() => setScope(s.id)}>{s.label}</button
			>
		{/each}
	</div>

	<ItemList view={scope} owner="search" {group} {filter}>
		{#snippet empty()}
			<p class="py-16 text-center text-sm text-muted-foreground">
				{query.trim() ? `Nothing matches “${query}”.` : 'Nothing here.'}
			</p>
		{/snippet}
	</ItemList>
</main>

<Dialog.Root open={!!editing} onOpenChange={(o) => !o && (editing = null)}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editing?.id ? 'Edit saved search' : 'Save as a tab'}</Dialog.Title>
			<Dialog.Description>A tab after the lanes, with this query.</Dialog.Description>
		</Dialog.Header>
		{#if editing}
			<div class="grid gap-3">
				<label class="grid gap-1 text-xs font-medium text-muted-foreground"
					>Name <Input bind:value={editing.name} maxlength={40} placeholder="Web reviews" /></label
				>
				<QueryInput bind:value={editing.query} id="saved-query" label="Query" />
			</div>
		{/if}
		<Dialog.Footer class="gap-2">
			{#if editing?.id}<Button
					variant="ghost"
					class="mr-auto text-destructive"
					onclick={deleteSearch}>Delete</Button
				>{/if}
			<Button variant="ghost" onclick={() => (editing = null)}>Cancel</Button>
			<Button
				disabled={!editing?.name.trim() || !!parseQuery(editing?.query ?? '').errors.length}
				onclick={saveSearch}>Save</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
