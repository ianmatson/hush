<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { dashQuery, keys, queryClient } from '$lib/queries';
	import { tokenHelp } from '$lib/token-help';
	import type { DashItem, DashKind, DashResponse, Turn } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Kbd } from '$lib/components/ui/kbd';
	import DashRow from './dash-row.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

	let { kind }: { kind: DashKind } = $props();
	const noun = $derived(kind === 'pr' ? 'pull requests' : 'issues');

	const dashQ = createQuery(() => dashQuery(kind));
	const data = $derived(dashQ.data ?? null);
	let refreshing = $state(false);
	let section = $state<string | null>(null);
	let query = $state('');
	let showHidden = $state(false);
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	let collapsed = $state<Record<Turn, boolean>>({
		you: false,
		team: false,
		them: false,
		none: true
	});

	const GROUPS: { turn: Turn; label: string; hint: string }[] = [
		{ turn: 'you', label: 'Your turn', hint: 'You are the next person who must act.' },
		{
			turn: 'team',
			label: "Your team's turn",
			hint: 'A review is requested from a team you are in.'
		},
		{ turn: 'them', label: 'Waiting on others', hint: 'You did your part. Someone else must act.' },
		{ turn: 'none', label: 'Other', hint: 'Drafts, and threads that only mention you.' }
	];

	const sectionNames = $derived(
		Object.fromEntries((data?.sections ?? []).map((s) => [s.id, s.name]))
	);
	const hiddenCount = $derived(data?.items.filter((i) => i.dismissed).length ?? 0);

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return (data?.items ?? []).filter(
			(i) =>
				i.dismissed === showHidden &&
				(!section || i.sections.includes(section)) &&
				(!q ||
					`${i.title} ${i.repo} ${i.author} ${i.turnReason} ${i.labels.map((l) => l.name).join(' ')}`
						.toLowerCase()
						.includes(q))
		);
	});

	const groups = $derived(
		GROUPS.map((g) => ({ ...g, items: visible.filter((i) => i.turn === g.turn) })).filter(
			(g) => g.items.length
		)
	);
	/** Keyboard order: only rows in open groups. */
	const navigable = $derived(groups.flatMap((g) => (collapsed[g.turn] ? [] : g.items)));
	const selectedIndex = $derived(navigable.findIndex((i) => i.id === selectedId));

	function sectionCount(id: string | null) {
		return (data?.items ?? []).filter((i) => !i.dismissed && (!id || i.sections.includes(id)))
			.length;
	}

	// Keep a valid selection when the list changes.
	$effect(() => {
		if (!navigable.some((i) => i.id === selectedId)) selectedId = navigable[0]?.id ?? null;
	});

	/** Force the server to search GitHub again (skips its 5-minute cache). */
	async function refresh() {
		refreshing = true;
		try {
			await queryClient.fetchQuery({
				queryKey: keys.dash(kind),
				queryFn: () => api.dashboard(kind, true),
				staleTime: 0
			});
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		const k = kind;
		untrack(() => {
			section = null;
			selectedId = null;
			const saved = localStorage.getItem(`hush:collapsed:${k}`);
			if (saved) collapsed = JSON.parse(saved);
		});
	});

	$effect(() => {
		localStorage.setItem(`hush:collapsed:${kind}`, JSON.stringify(collapsed));
	});

	function setDismissed(id: string, dismissed: boolean) {
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old ? { ...old, items: old.items.map((x) => (x.id === id ? { ...x, dismissed } : x)) } : old
		);
	}

	function open(i: DashItem, url: string) {
		window.open(url, '_blank', 'noopener');
	}

	async function toggleHide(i: DashItem) {
		const hide = !i.dismissed;
		const idx = navigable.findIndex((x) => x.id === i.id);
		const next = navigable[idx + 1] ?? navigable[idx - 1];
		if (selectedId === i.id) selectedId = next?.id ?? null;
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		setDismissed(i.id, hide);
		try {
			if (hide) await api.hide(i.id, i.updatedAt);
			else await api.unhide(i.id);
			toast(hide ? 'Hidden until it changes' : 'Shown again', {
				description: i.title,
				action: hide
					? {
							label: 'Undo',
							onClick: () => {
								setDismissed(i.id, false);
								api.unhide(i.id).catch((e) => toast.error(e.message));
							}
						}
					: undefined
			});
		} catch (err) {
			setDismissed(i.id, !hide);
			toast.error((err as Error).message);
		}
	}

	async function copy(i: DashItem) {
		await navigator.clipboard.writeText(i.url);
		toast.success('Link copied', { description: `${i.repo}#${i.number}` });
	}

	function move(delta: number) {
		if (!navigable.length) return;
		const n =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), navigable.length - 1);
		selectedId = navigable[n].id;
	}

	function onKey(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		const i = navigable[selectedIndex];
		const chips = [null, ...(data?.sections ?? []).map((s) => s.id)];
		const keys: Record<string, () => void> = {
			j: () => move(1),
			ArrowDown: () => move(1),
			k: () => move(-1),
			ArrowUp: () => move(-1),
			o: () => i && open(i, i.actionUrl),
			Enter: () => i && open(i, i.actionUrl),
			O: () => i && open(i, i.url),
			e: () => i && toggleHide(i),
			c: () => i && copy(i),
			h: () => (showHidden = !showHidden),
			r: () => refresh(),
			'/': () => searchEl?.focus(),
			'?': () => (helpOpen = true)
		};
		chips.slice(0, 10).forEach((id, n) => (keys[String(n)] = () => (section = id)));
		const fn = keys[e.key];
		if (fn) {
			e.preventDefault();
			fn();
		}
	}

	const shortcuts = [
		['J / K', 'Next / previous'],
		['Enter / O', 'Main action (review, fix CI…)'],
		['Shift + O', 'Open on GitHub'],
		['E', 'Hide until it changes (or show again)'],
		['C', 'Copy link'],
		['H', 'Show hidden items'],
		['0 – 9', 'All, or one section'],
		['R', 'Refresh from GitHub'],
		['/', 'Filter'],
		['?', 'Show shortcuts']
	];
</script>

<svelte:window onkeydown={onKey} />

<main class="mx-auto max-w-4xl px-4 pt-4 pb-24">
	<div class="flex flex-wrap items-center gap-2">
		<div class="relative w-full sm:w-56">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:ref={searchEl}
				bind:value={query}
				placeholder="Filter {noun}"
				class="h-8 pl-8"
				aria-label="Filter {noun}"
			/>
		</div>
		<div class="ml-auto flex items-center gap-1">
			<Button
				variant={showHidden ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => (showHidden = !showHidden)}
				disabled={!hiddenCount && !showHidden}
			>
				<EyeOff />{showHidden ? 'Showing hidden' : 'Hidden'}
				{#if hiddenCount}<span class="tabular-nums opacity-70">{hiddenCount}</span>{/if}
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Refresh from GitHub"
				onclick={refresh}
				disabled={refreshing}
			>
				<RefreshCw class={cn(refreshing && 'animate-spin')} />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Keyboard shortcuts"
				onclick={() => (helpOpen = true)}><Keyboard /></Button
			>
			<Button variant="ghost" size="icon-sm" aria-label="Edit sections" href="/settings/dashboards"
				><SlidersHorizontal /></Button
			>
		</div>
	</div>

	{#if data}
		<div
			class="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1"
			role="tablist"
			aria-label="Sections"
		>
			{#each [{ id: null, name: 'All' }, ...data.sections] as s (s.id ?? 'all')}
				{@const n = sectionCount(s.id)}
				<button
					role="tab"
					aria-selected={section === s.id}
					class={cn(
						'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
						section === s.id
							? 'border-foreground/20 bg-foreground text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground',
						!n && section !== s.id && 'opacity-50'
					)}
					onclick={() => (section = section === s.id ? null : s.id)}
				>
					{s.name}
					<span class="tabular-nums opacity-70">{n}</span>
				</button>
			{/each}
		</div>
	{/if}

	<p class="mt-2 mb-2 px-1 text-xs text-muted-foreground">
		{#if data}
			Updated {ago(data.fetchedAt)}
			{#if data.teams.length}· Teams: {data.teams.map((t) => t.slug).join(', ')}{/if}
		{:else}Loading from GitHub…{/if}
	</p>

	{#if dashQ.isError}
		<Alert.Root variant="destructive" class="mb-3"
			><Alert.Description>{dashQ.error.message}</Alert.Description></Alert.Root
		>
	{/if}
	{#each data?.errors ?? [] as err (err)}
		{@const help = tokenHelp(err)}
		<Alert.Root variant="destructive" class="mb-3">
			<Alert.Title>{help?.title ?? 'A search failed'}</Alert.Title>
			<Alert.Description>
				{help?.body ?? err}
				{#if help}<a class="underline" href="/login">Change token</a>{/if}
			</Alert.Description>
		</Alert.Root>
	{/each}
	{#each data?.sections.filter((s) => s.skipped) ?? [] as s (s.id)}
		<p class="mb-2 px-1 text-xs text-signal-warn">{s.name}: {s.skipped}</p>
	{/each}

	{#if dashQ.isPending}
		<div class="grid gap-2">
			{#each [0, 1, 2, 3, 4] as n (n)}
				<div class="flex items-center gap-3 px-3 py-3">
					<Skeleton class="size-8 rounded-full" />
					<div class="grid flex-1 gap-2">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/3" />
					</div>
				</div>
			{/each}
		</div>
	{:else if !visible.length}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
		>
			<CircleCheck class="mb-3 size-8 text-signal-merge" />
			{#if query}
				<p class="font-medium">No {noun} match “{query}”.</p>
			{:else if showHidden}
				<p class="font-medium">Nothing is hidden.</p>
			{:else}
				<p class="font-medium">No open {noun} involve you.</p>
				<p class="mt-1 text-sm text-muted-foreground">
					<a class="underline" href="/settings/dashboards">Edit the sections</a> to track more.
				</p>
			{/if}
		</div>
	{:else}
		<div class="grid gap-5">
			{#each groups as g (g.turn)}
				<section>
					<button
						class="group/h mb-1 flex w-full items-center gap-2 px-1 text-left"
						onclick={() => (collapsed[g.turn] = !collapsed[g.turn])}
						aria-expanded={!collapsed[g.turn]}
					>
						<ChevronDown
							class={cn(
								'size-3.5 text-muted-foreground transition-transform',
								collapsed[g.turn] && '-rotate-90'
							)}
						/>
						<h2 class="text-xs font-semibold tracking-wide uppercase">{g.label}</h2>
						<span class="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
						<span
							class="ml-2 hidden truncate text-xs text-muted-foreground opacity-0 transition-opacity group-hover/h:opacity-100 sm:inline"
							>{g.hint}</span
						>
					</button>
					{#if !collapsed[g.turn]}
						<ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5" role="listbox" aria-label={g.label}>
							{#each g.items as i (i.id)}
								<DashRow
									item={i}
									selected={i.id === selectedId}
									showSections={!section}
									{sectionNames}
									onopen={open}
									onhide={toggleHide}
									oncopy={copy}
									onselect={() => (selectedId = i.id)}
								/>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<Dialog.Root bind:open={helpOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header><Dialog.Title>Keyboard shortcuts</Dialog.Title></Dialog.Header>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			{#each shortcuts as [k, d] (k)}
				<dt><Kbd>{k}</Kbd></dt>
				<dd class="text-muted-foreground">{d}</dd>
			{/each}
		</dl>
	</Dialog.Content>
</Dialog.Root>
