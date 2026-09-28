<script lang="ts" module>
	import type { ItemDTO } from '$lib/shared/types';

	/** A group of rows under a heading (sections, people, days). */
	export interface ItemGroup {
		key: string;
		label: string | null;
		hint?: string;
		items: ItemDTO[];
	}
</script>

<script lang="ts">
	import ShortcutsDialog from './shortcuts-dialog.svelte';
	import { LIST_MOUSE, shortcutsFor } from '$lib/shortcuts';
	import { commandFor } from '$lib/keys.svelte';
	import { goto } from '$app/navigation';
	import { untrack, type Snippet } from 'svelte';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { flip } from 'svelte/animate';
	import { fade, fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		api,
		type ActionBody,
		type ItemAction,
		type ItemsResponse,
		type ListView
	} from '$lib/api';
	import { keys as qk, meQuery, queryClient, setCounts, itemsQuery } from '$lib/queries';
	import { Selection } from '$lib/selection.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ItemRow from './item-row.svelte';
	import ItemWhy from './item-why.svelte';
	import NotMineDialog from './not-mine-dialog.svelte';
	import BulkBar from './bulk-bar.svelte';
	import SnoozeItems from './snooze-items.svelte';
	import SnoozeSheet from './snooze-sheet.svelte';
	import AppMenu from './app-menu.svelte';
	import { claimPeek, closePeek, peek } from '$lib/peek.svelte';
	import { alreadyTrue, subjectKind } from '$lib/shared/snooze';
	import { palette } from '$lib/palette.svelte';
	import { itemCommands, itemMenu, type ItemActionContext } from '$lib/item-actions';
	import { openOnGitHub, reportResolved } from '$lib/recheck';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';

	let {
		view,
		owner,
		group,
		filter,
		empty,
		head
	}: {
		/** The server list to show. */
		view: ListView;
		/** The peek owner: the list that shows the peek's item. */
		owner: string;
		/** Put the items in groups, in order. */
		group: (items: ItemDTO[]) => ItemGroup[];
		/** Keep only these items (a saved search, the search box). */
		filter?: (items: ItemDTO[]) => ItemDTO[];
		/** When the list is empty. */
		empty: Snippet;
		/** Above the list (the "Hush finished" strip, the first-run card). */
		head?: Snippet<[ItemsResponse | undefined]>;
	} = $props();

	const BULK_MAX = 20;
	const FLIP = { duration: 220, easing: cubicOut };
	const me = createQuery(meQuery);
	const list = createQuery(() => itemsQuery(view));

	let helpOpen = $state(false);
	let bulkSnoozeOpen = $state(false);
	let notMine = $state<ItemDTO | null>(null);
	let selectedKey = $state<string | null>(null);
	// Items with an action in flight. A refetch must not bring them back.
	const pending = new SvelteSet<string>();
	const sel = new Selection();

	const visible = $derived.by(() => {
		const all = (list.data?.items ?? []).filter((t) => !pending.has(t.key));
		return filter ? filter(all) : all;
	});
	const groups = $derived(group(visible));
	// The keyboard order is the order on screen: group by group.
	const order = $derived(groups.flatMap((g) => g.items.map((t) => t.key)));
	const flat = $derived(groups.flatMap((g) => g.items));
	const selectedIndex = $derived(order.indexOf(selectedKey ?? ''));
	const byKey = (key: string) => flat.find((t) => t.key === key);
	$effect(() => {
		if (!order.includes(selectedKey ?? '')) selectedKey = order[0] ?? null;
		untrack(() => sel.prune(order));
	});

	// --- Peek: one panel for the app (lib/peek.svelte.ts); follows the cursor while this list
	// owns it -------------------------------------------------------------------------------
	const owns = $derived(peek.owner === owner);
	const peekOpen = $derived(peek.owner !== null);
	let peekSnoozeOpen = $state(false);
	const wide = new MediaQuery('min-width: 1024px');
	const peekItem = $derived.by(() => {
		const row = flat[selectedIndex] ?? null;
		return owns ? row : null;
	});
	let restoredFor: string | null = null;
	$effect(() => {
		const key = untrack(() => peek.target?.id);
		if (!owns) return void (restoredFor = null);
		if (restoredFor === owner || !list.data) return;
		restoredFor = owner;
		if (key && order.includes(key)) untrack(() => (selectedKey = key));
	});
	function take() {
		restoredFor = owner;
		claimPeek(owner);
	}
	$effect(() => {
		const t = peekItem;
		if (!owns || !list.data) return;
		untrack(() => {
			if (!t) return closePeek();
			peek.target = {
				id: t.key,
				repo: t.repo,
				number: t.number,
				title: t.title,
				url: t.url,
				need: t.needs
			};
		});
	});
	$effect(() => {
		if (!owns) return;
		peek.footer = peekFooter;
		peek.header = peekHeader;
		return () => {
			if (peek.footer === peekFooter) peek.footer = null;
			if (peek.header === peekHeader) peek.header = null;
		};
	});
	function peekThis(t: ItemDTO) {
		selectedKey = t.key;
		take();
	}
	// Seeing it in the peek counts as seeing it, once it stays open for a moment.
	$effect(() => {
		const t = peekItem;
		if (!t?.unseen || !t.number) return;
		const timer = setTimeout(() => act([t.key], 'seen'), 1500);
		return () => clearTimeout(timer);
	});
	// The palette chose an item in this list: peek it.
	$effect(() => {
		const r = palette.peekRequest;
		if (!r || r.list !== owner || !list.data) return;
		untrack(() => {
			palette.peekRequest = null;
			if (!order.includes(r.key)) return;
			sel.clear();
			selectedKey = r.key;
			take();
		});
	});

	const LABEL: Partial<Record<ItemAction, string>> = {
		done: 'Done: back when it is your turn again',
		snooze: 'Snoozed',
		mute: 'Muted. GitHub stops notifying you about it.',
		restore: 'Moved back',
		'my-turn': 'In Your turn until it changes'
	};
	/** Stay in this list: seen changes only the dot; the others move rows out. */
	const STAYS = new Set<ItemAction>(['seen']);

	/** Send an action for many items, 20 per request. */
	async function run(keys: string[], action: ItemAction, body?: ActionBody) {
		for (let i = 0; i < keys.length; i += BULK_MAX) {
			const res = await api.act(keys.slice(i, i + BULK_MAX), action, body);
			setCounts(res.counts);
		}
		// Other lists changed too; refetch them when they are next used.
		queryClient.invalidateQueries({ queryKey: qk.itemsAll });
	}

	async function act(keys: string[], action: ItemAction, body?: ActionBody) {
		if (!keys.length) return;
		const items = keys.map(byKey).filter((t): t is ItemDTO => !!t);
		if (STAYS.has(action)) {
			queryClient.setQueryData<ItemsResponse>(keys_(view), (old) =>
				old
					? {
							...old,
							items: old.items.map((x) =>
								keys.includes(x.key) ? { ...x, unseen: false, seenAt: Date.now() } : x
							)
						}
					: old
			);
			run(keys, action).catch((e) => toast.error(e.message));
			return;
		}
		// Optimistic: the rows leave this list now. Stop any refetch that could bring them back.
		const gone = new Set(keys);
		const after = flat.slice(Math.max(0, selectedIndex)).find((t) => !gone.has(t.key));
		const before = [...flat.slice(0, Math.max(0, selectedIndex))]
			.reverse()
			.find((t) => !gone.has(t.key));
		if (selectedKey && gone.has(selectedKey)) selectedKey = (after ?? before)?.key ?? null;
		for (const k of keys) pending.add(k);
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys_(view) });
		try {
			await run(keys, action, body);
			const undo: Partial<Record<ItemAction, ItemAction>> = {
				done: 'restore',
				snooze: 'restore',
				mute: 'restore',
				'my-turn': 'restore'
			};
			const back = undo[action];
			toast(LABEL[action] ?? 'Done', {
				description: items.length === 1 ? items[0].title : `${items.length} items`,
				action: back
					? { label: 'Undo', onClick: () => run(keys, back).catch((e) => toast.error(e.message)) }
					: undefined
			});
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			await queryClient.invalidateQueries({ queryKey: keys_(view) });
			for (const k of keys) pending.delete(k);
		}
	}
	const keys_ = (v: ListView) => qk.items(v);

	/** Rows an action applies to: the selection, or else the cursor row. */
	const targets = () => sel.targets(order, selectedKey);

	function open(t: ItemDTO, url: string) {
		openOnGitHub(url);
		if (t.unseen) act([t.key], 'seen');
	}
	async function copyLinks(keys: string[]) {
		const urls = keys
			.map(byKey)
			.filter(Boolean)
			.map((t) => t!.url);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}
	async function sync() {
		try {
			const status = await api.sync();
			if (status.lastError) toast.error(status.lastError);
			reportResolved(status.resolved ?? []);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: qk.itemsAll }),
				queryClient.invalidateQueries({ queryKey: qk.me })
			]);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	function onRowClick(e: MouseEvent, t: ItemDTO) {
		if (sel.click(e, t.key, order, selectedKey)) return;
		sel.clear();
		selectedKey = t.key;
		if (t.number) take();
	}
	function onToggle(e: MouseEvent, t: ItemDTO) {
		if (e.shiftKey) sel.range(order, t.key, selectedKey);
		else sel.toggle(t.key);
		selectedKey = t.key;
	}
	function move(delta: number, extend = false) {
		if (!order.length) return;
		if (extend && selectedKey) sel.ids.add(selectedKey);
		const i =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), order.length - 1);
		selectedKey = order[i];
		if (extend) sel.ids.add(selectedKey);
		if (peekOpen && !owns) take();
	}

	let menuSnoozeKeys = $state<string[]>([]);
	let menuSnoozeOpen = $state(false);
	const actions: ItemActionContext = {
		get order() {
			return order;
		},
		get menu() {
			return me.data?.settings.menu;
		},
		sel,
		byKey,
		peek: peekThis,
		open,
		act,
		notMine: (t) => (notMine = t),
		copyLinks,
		snoozeSheet: (keys) => {
			menuSnoozeKeys = keys;
			menuSnoozeOpen = true;
		}
	};
	const menuFor = (keys: string[]) => itemMenu(actions, keys);
	$effect(() => palette.register(() => itemCommands(actions, targets())));

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const cmd = commandFor(e, ['list', 'item']);
		if (!cmd) return;
		const t = flat[selectedIndex];
		const run: Record<string, () => void> = {
			'list.next': () => move(1),
			'list.prev': () => move(-1),
			'list.extendNext': () => move(1, true),
			'list.extendPrev': () => move(-1, true),
			'list.select': () => t && sel.toggle(t.key),
			'list.selectAll': () => sel.all(order),
			'list.peek': () => t && (owns ? closePeek() : take()),
			'list.escape': () => (peekOpen ? closePeek() : sel.clear()),
			'list.open': () => t && open(t, t.actionUrl),
			'list.openGitHub': () => t && open(t, t.url),
			'list.copy': () => copyLinks(targets()),
			'list.refresh': () => sync(),
			'list.search': () => goto('/search'),
			'list.help': () => (helpOpen = true),
			'item.done': () => act(targets(), 'done'),
			'item.snooze': () => actions.snoozeSheet(targets()),
			'item.mute': () => act(targets(), 'mute'),
			'item.notMine': () => t && t.lane === 'turn' && (notMine = t),
			'item.myTurn': () => t && t.lane !== 'turn' && act([t.key], 'my-turn'),
			'item.restore': () => act(targets(), 'restore')
		};
		const fn = run[cmd];
		if (fn) {
			e.preventDefault();
			fn();
		}
	}

	let menuKeys = $state<string[]>([]);
	function onContextMenu(e: MouseEvent) {
		const key = (e.target as Element).closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
		if (!key) {
			e.preventDefault();
			return;
		}
		if (!sel.has(key)) {
			sel.clear();
			selectedKey = key;
		}
		menuKeys = sel.size ? sel.targets(order, key) : [key];
	}
	const handled = (t: ItemDTO | undefined) =>
		!!t &&
		(t.state === 'done' ||
			t.state === 'muted' ||
			(t.state === 'snoozed' && (t.snoozedUntil ?? 0) > Date.now()));
	const subjectsOf = (keys: string[]) => keys.map((k) => subjectKind(byKey(k)?.subjectType ?? ''));
</script>

<svelte:window onkeydown={onKey} />

{@render head?.(list.data)}

{#key view}
	<div in:fade={{ duration: 150 }}>
		{#if list.isPending}
			<div class="grid gap-1 px-1">
				{#each [0, 1, 2, 3] as i (i)}
					<div class="flex gap-3 px-3 py-3">
						<Skeleton class="size-8 rounded-full" />
						<div class="grid flex-1 gap-2">
							<Skeleton class="h-4 w-2/3" />
							<Skeleton class="h-3 w-1/2" />
						</div>
					</div>
				{/each}
			</div>
		{:else if flat.length === 0}
			{@render empty()}
		{:else}
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					{#snippet child({ props })}
						<div
							{...props}
							oncontextmenucapture={onContextMenu}
							class="grid grid-cols-[minmax(0,1fr)] gap-5"
						>
							{#each groups as g (g.key)}
								<section aria-label={g.label ?? 'Items'} class="min-w-0">
									{#if g.label}
										<h2
											class="mb-1 flex items-baseline gap-2 px-3 text-xs font-medium text-muted-foreground"
										>
											<span class="tracking-wide uppercase">{g.label}</span>
											<span class="tabular-nums">{g.items.length}</span>
											{#if g.hint}<span class="font-normal opacity-80">· {g.hint}</span>{/if}
										</h2>
									{/if}
									<ul
										role="listbox"
										aria-multiselectable="true"
										aria-label={g.label ?? 'Items'}
										class="grid grid-cols-[minmax(0,1fr)] gap-0.5"
									>
										{#each g.items as t (t.key)}
											<li
												animate:flip={FLIP}
												out:slide={{ duration: 200, easing: cubicOut }}
												in:fly={{ y: -8, duration: 200 }}
											>
												<ItemRow
													item={t}
													selected={t.key === selectedKey}
													checked={sel.has(t.key)}
													selecting={sel.size > 0}
													onaction={(x, action, body) => act([x.key], action, body)}
													onopen={open}
													onrowclick={(e) => onRowClick(e, t)}
													ontoggle={(e) => onToggle(e, t)}
													menu={() => menuFor([t.key])}
												/>
											</li>
										{/each}
									</ul>
								</section>
							{/each}
						</div>
					{/snippet}
				</ContextMenu.Trigger>
				<ContextMenu.Content class="w-60">
					<AppMenu entries={menuFor(menuKeys)} kind="context" />
				</ContextMenu.Content>
			</ContextMenu.Root>
		{/if}
	</div>
{/key}

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	{#if targets().every((k) => handled(byKey(k)))}
		<Button variant="ghost" size="sm" onclick={() => act(targets(), 'restore')}
			><Undo />Move back</Button
		>
	{:else}
		<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act(targets(), 'done')}
			><Check /><span class="max-sm:hidden">Done</span></Button
		>
		<Button
			variant="ghost"
			size="sm"
			aria-label="Snooze"
			class="sm:hidden"
			onclick={() => (bulkSnoozeOpen = true)}><AlarmClock /></Button
		>
		<span class="max-sm:hidden">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="sm" aria-label="Snooze"
							><AlarmClock /><span>Snooze</span></Button
						>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="center" side="top" class="w-56">
					<SnoozeItems
						subjects={subjectsOf(targets())}
						onpick={(b) => act(targets(), 'snooze', b)}
					/>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</span>
		<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act(targets(), 'mute')}
			><BellOff /><span class="max-sm:hidden">Mute</span></Button
		>
	{/if}
</BulkBar>

<SnoozeSheet
	bind:open={bulkSnoozeOpen}
	subjects={subjectsOf(targets())}
	onpick={(b) => act(targets(), 'snooze', b)}
/>
<SnoozeSheet
	bind:open={menuSnoozeOpen}
	subjects={subjectsOf(menuSnoozeKeys)}
	disabled={menuSnoozeKeys.length === 1 && byKey(menuSnoozeKeys[0])
		? alreadyTrue({ ci: byKey(menuSnoozeKeys[0])!.ci, state: byKey(menuSnoozeKeys[0])!.prState })
		: []}
	onpick={(b) => act(menuSnoozeKeys, 'snooze', b)}
/>

{#snippet peekHeader()}
	{#if peekItem}
		<ItemWhy
			item={peekItem}
			onnotmine={() => (notMine = peekItem)}
			onmyturn={() => peekItem && act([peekItem.key], 'my-turn')}
		/>
	{/if}
{/snippet}

{#snippet peekFooter()}
	{#if peekItem}
		{@const t = peekItem}
		{#if handled(t)}
			<Button variant="ghost" size="sm" onclick={() => act([t.key], 'restore')}>
				<Undo />{t.state === 'muted' ? 'Unmute' : 'Move back'}
			</Button>
		{:else}
			{#if t.lane !== 'updates'}
				<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act([t.key], 'done')}
					><Check /><span class="max-sm:hidden">Done</span></Button
				>
				{#if wide.current}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="sm"><AlarmClock />Snooze</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" side="top" class="w-56">
							<SnoozeItems
								subjects={[subjectKind(t.subjectType)]}
								disabled={alreadyTrue({ ci: t.ci, state: t.prState })}
								onpick={(b) => act([t.key], 'snooze', b)}
							/>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{:else}
					<Button
						variant="ghost"
						size="sm"
						aria-label="Snooze"
						onclick={() => (peekSnoozeOpen = true)}
						><AlarmClock /><span class="max-sm:hidden">Snooze</span></Button
					>
				{/if}
			{/if}
			<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act([t.key], 'mute')}
				><BellOff /><span class="max-sm:hidden">Mute</span></Button
			>
		{/if}
	{/if}
{/snippet}

{#if peekItem}
	<SnoozeSheet
		bind:open={peekSnoozeOpen}
		subjects={[subjectKind(peekItem.subjectType)]}
		disabled={alreadyTrue({ ci: peekItem.ci, state: peekItem.prState })}
		onpick={(b) => peekItem && act([peekItem.key], 'snooze', b)}
	/>
{/if}

<NotMineDialog bind:item={notMine} />
<ShortcutsDialog
	bind:open={helpOpen}
	shortcuts={shortcutsFor(['global', 'list', 'item', 'peek'], LIST_MOUSE)}
/>
