<script lang="ts">
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { ListDrag } from '$lib/drag.svelte';
	import { api } from '$lib/api';
	import { dashQuery, keys, queryClient } from '$lib/queries';
	import { Selection } from '$lib/selection.svelte';
	import { tokenHelp } from '$lib/token-help';
	import { arrangeGroup, orderAfterDrop } from '$lib/shared/dashboard';
	import type { DashItem, DashKind, DashResponse, Turn } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Kbd } from '$lib/components/ui/kbd';
	import DashRow from './dash-row.svelte';
	import BulkBar from './bulk-bar.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Link from '@lucide/svelte/icons/link';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Undo from '@lucide/svelte/icons/undo-2';
	import SquareCheck from '@lucide/svelte/icons/square-check';

	let { kind }: { kind: DashKind } = $props();
	const noun = $derived(kind === 'pr' ? 'pull requests' : 'issues');
	const FLIP = { duration: 260, easing: cubicOut };

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
	const sel = new Selection();

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
	const groupLabel = (t: Turn) => GROUPS.find((g) => g.turn === t)!.label;

	const sectionNames = $derived(
		Object.fromEntries((data?.sections ?? []).map((s) => [s.id, s.name]))
	);
	const hiddenCount = $derived(data?.items.filter((i) => i.dismissed).length ?? 0);

	const filtered = $derived.by(() => {
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

	/** Groups in display order: new items on top, then your manual order. */
	const baseGroups = $derived(
		GROUPS.map((g) => ({
			...g,
			items: arrangeGroup(filtered.filter((i) => i.turn === g.turn))
		}))
	);

	// --- Drag and drop ----------------------------------------------------------------
	const drag = new ListDrag({
		enabled: () => !showHidden,
		// Dragging a selected row moves the whole selection, in list order.
		pick: (id) => (sel.has(id) && sel.size > 1 ? sel.targets(order, id) : [id]),
		isCollapsed: (zone) => collapsed[zone as Turn],
		drop: (ids, zone, index) => dropAt(ids, zone as Turn, index)
	});
	const dragging = $derived(new Set(drag.ids));

	/** Rows to render: dragged rows leave their lists; the placeholder opens where they land. */
	const groups = $derived(
		baseGroups.map((g) => {
			const rows: { key: string; item: DashItem | null }[] = g.items
				.filter((i) => !dragging.has(i.id))
				.map((i) => ({ key: i.id, item: i }));
			if (drag.active && drag.zone === g.turn && !collapsed[g.turn])
				rows.splice(Math.min(drag.index, rows.length), 0, { key: '__placeholder', item: null });
			return { ...g, rows };
		})
	);

	/** Keyboard order: only rows in open groups. */
	const navigable = $derived(baseGroups.flatMap((g) => (collapsed[g.turn] ? [] : g.items)));
	const order = $derived(navigable.map((i) => i.id));
	const selectedIndex = $derived(navigable.findIndex((i) => i.id === selectedId));
	const byId = (id: string) => data?.items.find((i) => i.id === id);

	/** `index` counts the visible rows left in the group once the dragged rows are out. */
	function dropAt(ids: string[], turn: Turn, index: number) {
		const left = (baseGroups.find((g) => g.turn === turn)?.items ?? [])
			.map((i) => i.id)
			.filter((id) => !ids.includes(id));
		const visible = [...left.slice(0, index), ...ids, ...left.slice(index)];
		return arrange(ids, turn, orderAfterDrop(fullGroup(turn), visible, ids));
	}

	// Enter and leave animations that know about dragging.
	type Row = { key: string; item: DashItem | null };
	function enter(node: Element, r: Row) {
		if (!r.item)
			return drag.fresh ? { duration: 0 } : slide(node, { duration: 200, easing: cubicOut });
		if (drag.settling) {
			// The dropped stack unfolds: the first card is already in place, the rest slide out of it.
			const k = drag.unfold.indexOf(r.item.id);
			return k < 0
				? { duration: 0 }
				: fly(node, { y: -28, opacity: 0, duration: 320, delay: 35 * k, easing: cubicOut });
		}
		if (drag.active) return { duration: 0 };
		return fly(node, { y: -8, duration: 200 });
	}
	function leave(node: Element, r: Row) {
		if (!r.item)
			return drag.settling ? { duration: 0 } : slide(node, { duration: 200, easing: cubicOut });
		// Rows lifted by a drag vanish at once: the floating card stands in for them.
		if (drag.active || drag.settling) return { duration: 0 };
		return slide(node, { duration: 200, easing: cubicOut });
	}

	/** Full order of a group, including rows hidden by the current filter. */
	const fullGroup = (turn: Turn) =>
		arrangeGroup(
			(data?.items ?? []).filter((i) => i.turn === turn && i.dismissed === showHidden)
		).map((i) => i.id);

	function dropped(id: string, turn: Turn, visible: string[]) {
		// Dragging a selected row moves the whole selection, in list order.
		const moved = sel.has(id) && sel.size > 1 ? sel.targets(order, id) : [id];
		const block = new Set(moved);
		const vis = visible.filter((x) => x === id || !block.has(x));
		vis.splice(vis.indexOf(id), 1, ...moved);
		const before = fullGroup(turn);
		const next = orderAfterDrop(before, vis, moved);
		const sameGroup = moved.every((m) => byId(m)?.turn === turn);
		if (sameGroup && next.join() === before.join()) return;
		arrange(moved, turn, next);
	}

	/**
	 * Move items into a group at a given order: update the cache now, then save.
	 * `turn` null undoes your moves (back to Hush's group).
	 */
	async function arrange(ids: string[], turn: Turn | null, groupOrder?: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const prev = new Map(items.map((i) => [i.id, i]));
		const target = (i: DashItem) => turn ?? i.autoTurn;
		const rank = new Map((groupOrder ?? []).map((x, n) => [x, n]));
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		const set = (fn: (x: DashItem) => DashItem) =>
			queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
				old ? { ...old, items: old.items.map(fn) } : old
			);
		set((x) =>
			prev.has(x.id)
				? {
						...x,
						turn: target(x),
						movedByYou: target(x) !== x.autoTurn,
						rank: rank.get(x.id) ?? x.rank
					}
				: rank.has(x.id)
					? { ...x, rank: rank.get(x.id)! }
					: x
		);
		sel.clear();
		// Save in the background: a drop must finish its one visual update without waiting.
		void persistArrange(items, target, groupOrder, prev, turn, set);
	}

	async function persistArrange(
		items: DashItem[],
		target: (i: DashItem) => Turn,
		groupOrder: string[] | undefined,
		prev: Map<string, DashItem>,
		turn: Turn | null,
		set: (fn: (x: DashItem) => DashItem) => void
	) {
		try {
			await api.arrange(
				items.map((i) => ({
					id: i.id,
					updatedAt: i.updatedAt,
					// Same group: leave any move as it is. Back to Hush's group: undo the move.
					turn: target(i) === i.turn ? undefined : target(i) === i.autoTurn ? null : target(i)
				})),
				groupOrder ?? []
			);
			if (items.some((i) => i.turn !== target(i)))
				toast(turn ? `Moved to “${groupLabel(turn)}”` : 'Back in its own group', {
					description: items.length === 1 ? items[0].title : `${items.length} items`,
					action: {
						label: 'Undo',
						onClick: () => {
							set((x) => prev.get(x.id) ?? x);
							api
								.arrange(
									items.map((i) => ({
										id: i.id,
										updatedAt: i.updatedAt,
										turn: i.movedByYou ? i.turn : null
									})),
									[]
								)
								.catch((err) => toast.error(err.message));
						}
					}
				});
		} catch (err) {
			toast.error((err as Error).message);
			queryClient.invalidateQueries({ queryKey: keys.dash(kind) });
		}
	}

	// --- Everything else --------------------------------------------------------------
	$effect(() => {
		if (!navigable.some((i) => i.id === selectedId)) selectedId = navigable[0]?.id ?? null;
		untrack(() => sel.prune(order));
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
			sel.clear();
			const saved = localStorage.getItem(`hush:collapsed:${k}`);
			if (saved) collapsed = JSON.parse(saved);
		});
	});

	$effect(() => {
		localStorage.setItem(`hush:collapsed:${kind}`, JSON.stringify(collapsed));
	});

	function sectionCount(id: string | null) {
		return (data?.items ?? []).filter((i) => !i.dismissed && (!id || i.sections.includes(id)))
			.length;
	}

	function setDismissed(ids: Set<string>, dismissed: boolean) {
		queryClient.setQueryData<DashResponse>(keys.dash(kind), (old) =>
			old ? { ...old, items: old.items.map((x) => (ids.has(x.id) ? { ...x, dismissed } : x)) } : old
		);
	}

	async function toggleHide(ids: string[]) {
		const items = ids.map(byId).filter((i): i is DashItem => !!i);
		if (!items.length) return;
		const hide = !items[0].dismissed;
		const set = new Set(items.map((i) => i.id));
		const after = navigable.slice(Math.max(0, selectedIndex)).find((i) => !set.has(i.id));
		if (selectedId && set.has(selectedId)) selectedId = after?.id ?? null;
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys.dash(kind) });
		setDismissed(set, hide);
		try {
			if (hide) await api.hide(items.map((i) => ({ id: i.id, updatedAt: i.updatedAt })));
			else await api.unhide([...set]);
			toast(hide ? 'Hidden until it changes' : 'Shown again', {
				description: items.length === 1 ? items[0].title : `${items.length} items`,
				action: hide
					? {
							label: 'Undo',
							onClick: () => {
								setDismissed(set, false);
								api.unhide([...set]).catch((e) => toast.error(e.message));
							}
						}
					: undefined
			});
		} catch (err) {
			setDismissed(set, !hide);
			toast.error((err as Error).message);
		}
	}

	function open(i: DashItem, url: string) {
		window.open(url, '_blank', 'noopener');
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((i) => i!.url);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	/** Move to the top of another group (menu and bulk bar). */
	function moveTo(ids: string[], turn: Turn) {
		const block = new Set(ids);
		arrange(ids, turn, [
			...order.filter((x) => block.has(x)),
			...fullGroup(turn).filter((x) => !block.has(x))
		]);
	}

	const targets = () => sel.targets(order, selectedId);

	function onRowClick(e: MouseEvent, i: DashItem) {
		if (sel.click(e, i.id, order, selectedId)) return;
		sel.clear();
		selectedId = i.id;
	}

	function onToggle(e: MouseEvent, i: DashItem) {
		if (e.shiftKey) sel.range(order, i.id, selectedId);
		else sel.toggle(i.id);
		selectedId = i.id;
	}

	function move(delta: number, extend = false) {
		if (!navigable.length) return;
		if (extend && selectedId) sel.ids.add(selectedId);
		const n =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), navigable.length - 1);
		selectedId = navigable[n].id;
		if (extend) sel.ids.add(selectedId);
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			sel.all(order);
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const i = navigable[selectedIndex];
		const chips = [null, ...(data?.sections ?? []).map((s) => s.id)];
		const keys: Record<string, () => void> = {
			j: () => move(1),
			ArrowDown: () => move(1),
			k: () => move(-1),
			ArrowUp: () => move(-1),
			J: () => move(1, true),
			K: () => move(-1, true),
			x: () => i && sel.toggle(i.id),
			Escape: () => sel.clear(),
			o: () => i && open(i, i.actionUrl),
			Enter: () => i && open(i, i.actionUrl),
			O: () => i && open(i, i.url),
			e: () => toggleHide(targets()),
			c: () => copyLinks(targets()),
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

	// --- Right-click menu: one menu for the whole list --------------------------------
	let menuIds = $state<string[]>([]);
	function onContextMenu(e: MouseEvent) {
		const id = (e.target as Element).closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
		if (!id) {
			e.preventDefault();
			return;
		}
		// Right-click inside the selection acts on all of it; elsewhere, on that row only.
		if (!sel.has(id)) {
			sel.clear();
			selectedId = id;
		}
		menuIds = sel.size ? sel.targets(order, id) : [id];
	}
	const menuOne = $derived(menuIds.length === 1 ? byId(menuIds[0]) : undefined);
	const menuMoved = $derived(menuIds.some((id) => byId(id)?.movedByYou));
	const n = (label: string) => (menuIds.length > 1 ? `${label} (${menuIds.length})` : label);

	const shortcuts = [
		['J / K', 'Next / previous'],
		['Shift + J / K', 'Extend the selection'],
		['X', 'Select or deselect'],
		['⌘ / Ctrl + A', 'Select all'],
		['⌘ / Ctrl + click', 'Add to selection'],
		['Shift + click', 'Select a range'],
		['Drag ⋮⋮', 'Move to another group or position'],
		['Enter / O', 'Main action (review, fix CI…)'],
		['Shift + O', 'Open on GitHub'],
		['E', 'Hide until it changes (or show again)'],
		['C', 'Copy link'],
		['H', 'Show hidden items'],
		['Esc', 'Clear the selection'],
		['0 – 9', 'All, or one section'],
		['R', 'Refresh from GitHub'],
		['/', 'Filter'],
		['?', 'Show shortcuts']
	];
</script>

<svelte:window onkeydown={onKey} />

<main class="mx-auto max-w-4xl px-4 pt-4 pb-24">
	<div class="flex flex-wrap items-center gap-2">
		<div class="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
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
				<EyeOff /><span class="hidden sm:inline">{showHidden ? 'Showing hidden' : 'Hidden'}</span>
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
				class="hidden sm:inline-flex"
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
				{@const count = sectionCount(s.id)}
				<button
					role="tab"
					aria-selected={section === s.id}
					class={cn(
						'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
						section === s.id
							? 'border-foreground/20 bg-foreground text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground',
						!count && section !== s.id && 'opacity-50'
					)}
					onclick={() => (section = section === s.id ? null : s.id)}
				>
					{s.name}
					<span class="tabular-nums opacity-70">{count}</span>
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
			{#each [0, 1, 2, 3, 4] as k (k)}
				<div class="flex items-center gap-3 px-3 py-3">
					<Skeleton class="size-8 rounded-full" />
					<div class="grid flex-1 gap-2">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/3" />
					</div>
				</div>
			{/each}
		</div>
	{:else if !filtered.length}
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
		<ContextMenu.Root>
			<ContextMenu.Trigger>
				{#snippet child({ props })}
					<div {...props} class="grid gap-5" data-drag-root oncontextmenucapture={onContextMenu}>
						{#each groups as g (g.turn)}
							{@const count = baseGroups.find((b) => b.turn === g.turn)?.items.length ?? 0}
							{@const target = drag.active && drag.zone === g.turn}
							{@const headerDrop = target && (collapsed[g.turn] || !count)}
							<!-- The whole group (header and rows) is one drop zone. Always in the layout, so
							     picking up a card never shifts the page. -->
							<section data-drag-zone={g.turn}>
								<button
									class={cn(
										'group/h mb-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-150',
										headerDrop && 'bg-primary/[0.07] text-primary'
									)}
									onclick={() => (collapsed[g.turn] = !collapsed[g.turn])}
									aria-expanded={!collapsed[g.turn]}
								>
									<ChevronDown
										class={cn(
											'size-3.5 text-muted-foreground transition-transform',
											collapsed[g.turn] && '-rotate-90'
										)}
									/>
									<h2
										class={cn(
											'text-xs font-semibold tracking-wide uppercase',
											!count && !headerDrop && 'text-muted-foreground/70'
										)}
									>
										{g.label}
									</h2>
									<span class="text-xs text-muted-foreground tabular-nums">{count}</span>
									<span
										class={cn(
											'ml-2 hidden truncate text-xs text-muted-foreground opacity-0 transition-opacity group-hover/h:opacity-100 sm:inline',
											headerDrop && 'text-primary opacity-100'
										)}>{headerDrop ? 'Drop to move here' : g.hint}</span
									>
								</button>
								{#if !collapsed[g.turn]}
									<!-- An empty list is 0 px tall; the placeholder opens it when you drag over. -->
									<ul
										class="relative grid grid-cols-[minmax(0,1fr)] gap-0.5"
										role="listbox"
										aria-multiselectable="true"
										aria-label={g.label}
									>
										{#each g.rows as r (r.key)}
											<li
												animate:flip={FLIP}
												in:enter={r}
												out:leave={r}
												data-drag-id={r.item?.id}
												data-drag-placeholder={!r.item || undefined}
												style={r.item ? undefined : `height: ${drag.gap}px`}
												class={r.item
													? 'drag-row'
													: 'rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.05]'}
												onpointerdown={(e) =>
													r.item && drag.pointerdown(e, r.item.id, e.currentTarget)}
											>
												{#if r.item}
													{@const i = r.item}
													<DashRow
														item={i}
														selected={i.id === selectedId}
														checked={sel.has(i.id)}
														selecting={sel.size > 0}
														draggable={!showHidden}
														showSections={!section}
														{sectionNames}
														onopen={open}
														onhide={(x) => toggleHide([x.id])}
														oncopy={(x) => copyLinks([x.id])}
														onrowclick={(e) => onRowClick(e, i)}
														ontoggle={(e) => onToggle(e, i)}
														onundomove={(x) => arrange([x.id], null)}
														groups={GROUPS}
														onmove={(x, turn) => moveTo([x.id], turn)}
													/>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</section>
						{/each}
					</div>
				{/snippet}
			</ContextMenu.Trigger>
			<ContextMenu.Content class="w-64">
				{#if menuOne}
					<ContextMenu.Item onclick={() => open(menuOne, menuOne.actionUrl)}>
						<ExternalLink />{menuOne.actionLabel}<ContextMenu.Shortcut>↵</ContextMenu.Shortcut>
					</ContextMenu.Item>
					<ContextMenu.Item onclick={() => open(menuOne, menuOne.url)}>
						<ExternalLink />Open on GitHub<ContextMenu.Shortcut>⇧O</ContextMenu.Shortcut>
					</ContextMenu.Item>
					<ContextMenu.Separator />
				{/if}
				<ContextMenu.Sub>
					<ContextMenu.SubTrigger><ArrowRightLeft />{n('Move to')}</ContextMenu.SubTrigger>
					<ContextMenu.SubContent>
						{#each GROUPS as g (g.turn)}
							<ContextMenu.Item
								disabled={menuIds.every((id) => byId(id)?.turn === g.turn)}
								onclick={() => moveTo(menuIds, g.turn)}
							>
								{g.label}
							</ContextMenu.Item>
						{/each}
					</ContextMenu.SubContent>
				</ContextMenu.Sub>
				{#if menuMoved}
					<ContextMenu.Item onclick={() => arrange(menuIds, null)}
						><Undo />{n('Undo move')}</ContextMenu.Item
					>
				{/if}
				<ContextMenu.Item onclick={() => toggleHide(menuIds)}>
					{#if showHidden}<Eye />{n('Show again')}{:else}<EyeOff />{n('Hide until it changes')}{/if}
					<ContextMenu.Shortcut>E</ContextMenu.Shortcut>
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => copyLinks(menuIds)}>
					<Link />{n(menuIds.length > 1 ? 'Copy links' : 'Copy link')}<ContextMenu.Shortcut
						>C</ContextMenu.Shortcut
					>
				</ContextMenu.Item>
				<ContextMenu.Separator />
				{#if menuOne}
					<ContextMenu.Item onclick={() => sel.toggle(menuOne.id)}>
						<SquareCheck />{sel.has(menuOne.id) ? 'Deselect' : 'Select'}<ContextMenu.Shortcut
							>X</ContextMenu.Shortcut
						>
					</ContextMenu.Item>
				{/if}
				<ContextMenu.Item onclick={() => sel.all(order)}>
					<SquareCheck />Select all<ContextMenu.Shortcut>⌘A</ContextMenu.Shortcut>
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</main>

{#if drag.active}
	{@const first = byId(drag.ids[0])}
	{@const lift = drag.lift.current}
	<!-- The card under the pointer. With a selection, the others stack behind it. -->
	<div
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; transform-origin: {drag.grab.x}px {drag.grab
			.y}px; transform: translate3d({drag.pos.current.x}px, {drag.pos.current.y}px, 0) scale({1 -
			0.08 * lift});"
	>
		{#each drag.ids.slice(1, 3).reverse() as id, k (id)}
			{@const depth = drag.ids.slice(1, 3).length - k}
			<div
				class="absolute inset-0 rounded-xl border bg-background"
				style="transform: translateY({depth * 10 * lift}px) scale({1 - depth * 0.03}); opacity: {1 -
					depth * 0.22}; box-shadow: 0 6px 16px -10px rgb(0 0 0 / 0.3);"
			></div>
		{/each}
		<div
			class="relative overflow-hidden rounded-xl border bg-background"
			style="box-shadow: 0 {6 + 16 * lift}px {18 + 30 * lift}px -{10 -
				2 * lift}px rgb(0 0 0 / {0.12 + 0.22 * lift});"
		>
			{#if first}
				<DashRow
					item={first}
					checked={sel.has(first.id)}
					{sectionNames}
					draggable={false}
					onopen={() => {}}
					onhide={() => {}}
					oncopy={() => {}}
					onrowclick={() => {}}
					ontoggle={() => {}}
					onundomove={() => {}}
				/>
			{/if}
		</div>
		{#if drag.ids.length > 1}
			<span class="drag-count" style="transform: scale({0.6 + 0.4 * lift})">{drag.ids.length}</span>
		{/if}
	</div>
{/if}

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label="Move to"
					><ArrowRightLeft /><span class="hidden sm:inline">Move to</span></Button
				>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="center" side="top">
			{#each GROUPS as g (g.turn)}
				<DropdownMenu.Item onclick={() => moveTo(targets(), g.turn)}>{g.label}</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<Button
		variant="ghost"
		size="sm"
		aria-label={showHidden ? 'Show again' : 'Hide until it changes'}
		onclick={() => toggleHide(targets())}
	>
		{#if showHidden}<Eye /><span class="hidden sm:inline">Show</span>{:else}<EyeOff /><span
				class="hidden sm:inline">Hide</span
			>{/if}
	</Button>
	<Button variant="ghost" size="sm" aria-label="Copy links" onclick={() => copyLinks(targets())}
		><Link /><span class="hidden sm:inline">Copy links</span></Button
	>
</BulkBar>

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
