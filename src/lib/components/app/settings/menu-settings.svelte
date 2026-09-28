<script lang="ts">
	import type { Component } from 'svelte';
	import { untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_MENU, MENU_ITEMS, SEP, tidySeparators } from '$lib/shared/menus';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Command from '$lib/components/ui/command';
	import SortableList from '$lib/components/app/sortable-list.svelte';
	import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import Link from '@lucide/svelte/icons/link';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import Zap from '@lucide/svelte/icons/zap';
	import CircleSlash from '@lucide/svelte/icons/circle-slash';
	import Hand from '@lucide/svelte/icons/hand';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	const me = createQuery(meQuery);
	let adding = $state(false);
	const saved = $derived(me.data?.settings.menu);

	/** One entry of the list. Separators repeat, so each row has its own stable key. */
	type Row = { id: string; key: string };
	let nextKey = 0;
	const toRows = (ids: string[]): Row[] =>
		ids.map((id) => ({ id, key: id === SEP ? `sep-${nextKey++}` : id }));

	let draft = $state<Row[]>([]);
	const ids = () => draft.map((r) => r.id);
	let dirty = $state(false);
	let saving = $state(false);
	const load = (s: string[]) => (draft = toRows(s));
	// Fill the editor once the settings arrive, and after each save.
	$effect(() => {
		const s = saved;
		untrack(() => {
			if (s && !dirty) load(s);
		});
	});

	const ICONS: Record<string, Component> = {
		peek: PanelRightOpen,
		main: ExternalLink,
		github: ExternalLink,
		done: Check,
		snooze: AlarmClock,
		mute: BellOff,
		restore: Undo,
		'not-mine': CircleSlash,
		'my-turn': Hand,
		copy: Link,
		select: SquareCheck,
		selectAll: SquareCheck,
		rule: ListFilter
	};
	const iconOf = (id: string) =>
		ICONS[id] ?? (id.startsWith('snooze:') ? AlarmClock : id.startsWith('until:') ? Zap : Check);
	const info = (id: string) => MENU_ITEMS.find((i) => i.id === id);
	/** Preview labels: what the menu says for a typical item. */
	const PREVIEW: Record<string, string> = {
		main: 'Review',
		snooze: 'Snooze',
		restore: 'Move back',
		select: 'Select'
	};
	const SUBMENUS = new Set(['snooze']);

	const unused = $derived(MENU_ITEMS.filter((i) => !ids().includes(i.id)));
	// The preview shows a typical item in Your turn.
	const NOT_TYPICAL = new Set(['restore', 'my-turn']);
	const preview = $derived(
		tidySeparators(
			ids().filter((id) => !NOT_TYPICAL.has(id)),
			(id) => id === SEP
		)
	);

	function set(list: Row[]) {
		draft = list;
		dirty = true;
	}
	const remove = (k: number) => set(draft.filter((_, i) => i !== k));
	const add = (id: string) => set([...draft, ...toRows([id])]);

	async function save() {
		saving = true;
		// Separators at the ends or next to each other do nothing; save the tidy list.
		const menu = tidySeparators(ids(), (id) => id === SEP);
		if (await saveSettings({ menu }, 'Menu saved')) dirty = false;
		saving = false;
	}
	function reset() {
		set(toRows(DEFAULT_MENU));
	}
</script>

<!-- Items not in the menu, to add: a searchable list, not a wall of buttons. -->
<Command.Dialog
	bind:open={adding}
	title="Add a menu item"
	description="Search the items that are not in the menu."
>
	<Command.Input placeholder="Search menu items…" />
	<Command.List class="max-h-[min(24rem,60vh)]">
		<Command.Empty>No item matches.</Command.Empty>
		{#each [['main', 'Not in the menu'], ['shortcut', 'One-click shortcuts']] as [group, title] (group)}
			{@const items = unused.filter((i) => i.group === group)}
			{#if items.length}
				<Command.Group heading={title}>
					{#each items as i (i.id)}
						{@const Icon = iconOf(i.id)}
						<Command.Item
							value={`${i.label} ${i.note ?? ''}`}
							onSelect={() => {
								add(i.id);
								adding = false;
							}}
						>
							<Icon class="text-muted-foreground" />
							<span class="flex-1">
								{i.label}
								{#if i.note}<span class="block text-xs text-muted-foreground">{i.note}</span>{/if}
							</span>
						</Command.Item>
					{/each}
				</Command.Group>
			{/if}
		{/each}
		<Command.Group heading="Layout">
			<Command.Item
				value="Separator line"
				onSelect={() => {
					add(SEP);
					adding = false;
				}}><Minus class="text-muted-foreground" />Separator</Command.Item
			>
		</Command.Group>
	</Command.List>
</Command.Dialog>

{#snippet menuRow(row: Row)}
	{@const Icon = iconOf(row.id)}
	{#if row.id === SEP}
		<span class="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
			<span class="h-px flex-1 bg-border"></span>Separator<span class="h-px flex-1 bg-border"
			></span>
		</span>
	{:else}
		<Icon class="size-4 shrink-0 text-muted-foreground" />
		<span class="min-w-0 flex-1">
			<span class="block truncate">{info(row.id)?.label ?? row.id}</span>
			{#if info(row.id)?.note}<span class="block truncate text-xs text-muted-foreground"
					>{info(row.id)?.note}</span
				>{/if}
		</span>
	{/if}
{/snippet}

<div class="grid gap-6">
	<div>
		<h2 class="text-base font-semibold tracking-tight">Menu</h2>
		<p class="text-sm text-muted-foreground">
			Choose the items and their order in the right-click menu of an item. The same list is the “⋯”
			menu on phones. Hidden items still work with their keys and in the command palette.
		</p>
	</div>

	{#if saved}
		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
			<Card.Root>
				<Card.Header>
					<Card.Title>In the menu</Card.Title>
					<Card.Description
						>Drag, or use the arrows. Items that do not apply to an item stay out of its menu, for
						example Done for an item that is done.</Card.Description
					>
				</Card.Header>
				<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-4">
					<SortableList
						items={draft}
						onchange={set}
						label="Menu items in order"
						empty="The menu is empty."
					>
						{#snippet row(r)}{@render menuRow(r)}{/snippet}
						{#snippet actions(_, k)}
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Remove from the menu"
								onclick={() => remove(k)}><X /></Button
							>
						{/snippet}
					</SortableList>

					<div class="border-t pt-4">
						<Button variant="outline" size="sm" onclick={() => (adding = true)}
							><Plus />Add item…</Button
						>
					</div>
				</Card.Content>
				<Card.Footer class="flex flex-wrap justify-between gap-2 border-t">
					<Button variant="ghost" size="sm" onclick={reset}>Reset to default</Button>
					<div class="flex gap-2">
						{#if dirty}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									dirty = false;
									if (saved) load(saved);
								}}>Cancel</Button
							>
						{/if}
						<Button size="sm" disabled={!dirty || saving} onclick={save}>Save</Button>
					</div>
				</Card.Footer>
			</Card.Root>

			<div class="grid content-start gap-2 lg:sticky lg:top-16 lg:self-start">
				<h2 class="text-xs font-medium text-muted-foreground">Preview</h2>
				<div
					class="rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
					aria-label="Menu preview"
				>
					{#each preview as id, k (`${id}-${k}`)}
						{#if id === SEP}
							<div class="-mx-1 my-1 h-px bg-border"></div>
						{:else}
							{@const Icon = iconOf(id)}
							<div class="flex items-center gap-2 rounded-md px-2 py-1.5">
								<Icon class="size-4 text-muted-foreground" />
								<span class="truncate">{PREVIEW[id] ?? info(id)?.label}</span>
								{#if SUBMENUS.has(id)}<ChevronRight
										class="ml-auto size-4 text-muted-foreground"
									/>{/if}
							</div>
						{/if}
					{:else}
						<p class="px-2 py-1.5 text-muted-foreground">No items.</p>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					For one item in Your turn. With a selection, most items act on all of it.
				</p>
			</div>
		</div>
	{/if}
</div>
