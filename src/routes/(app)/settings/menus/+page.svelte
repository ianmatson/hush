<script lang="ts">
	import type { Component } from 'svelte';
	import { untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import {
		DEFAULT_MENUS,
		MENU_ITEMS,
		MENUS_VERSION,
		SEP,
		tidySeparators,
		type MenuKind
	} from '$lib/shared/menus';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import SortableList from '$lib/components/app/sortable-list.svelte';
	import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Link from '@lucide/svelte/icons/link';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import Zap from '@lucide/svelte/icons/zap';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	const me = createQuery(meQuery);
	const saved = $derived(me.data?.settings.menus);

	/** One entry of the list. Separators repeat, so each row has its own stable key. */
	type Row = { id: string; key: string };
	let nextKey = 0;
	const toRows = (ids: string[]): Row[] =>
		ids.map((id) => ({ id, key: id === SEP ? `sep-${nextKey++}` : id }));

	let kind = $state<MenuKind>('inbox');
	let draft = $state<Record<MenuKind, Row[]>>({ inbox: [], dash: [] });
	const ids = (k: MenuKind) => draft[k].map((r) => r.id);
	let dirty = $state(false);
	let saving = $state(false);
	const load = (s: { inbox: string[]; dash: string[] }) =>
		(draft = { inbox: toRows(s.inbox), dash: toRows(s.dash) });
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
		read: MailOpen,
		copy: Link,
		select: SquareCheck,
		selectAll: SquareCheck,
		move: ArrowRightLeft,
		undoMove: Undo,
		hide: EyeOff,
		rule: ListFilter
	};
	const iconOf = (id: string) =>
		ICONS[id] ??
		(id.startsWith('snooze:') ? AlarmClock : id.startsWith('until:') ? Zap : ArrowRightLeft);
	const info = (id: string) => MENU_ITEMS[kind].find((i) => i.id === id);
	/** Preview labels: what the menu says for a typical item. */
	const PREVIEW: Record<string, string> = {
		main: 'Review',
		snooze: 'Snooze',
		restore: 'Move to inbox',
		read: 'Mark as read',
		select: 'Select',
		hide: 'Hide until it changes',
		move: 'Move to'
	};
	const SUBMENUS = new Set(['snooze', 'move']);

	const unused = $derived(MENU_ITEMS[kind].filter((i) => !ids(kind).includes(i.id)));
	// The preview shows a typical open thread: "Needs you" in the inbox, not moved on a dashboard.
	const NOT_TYPICAL = new Set(['restore', 'undoMove']);
	const preview = $derived(
		tidySeparators(
			ids(kind).filter((id) => !NOT_TYPICAL.has(id)),
			(id) => id === SEP
		)
	);

	function set(list: Row[]) {
		draft[kind] = list;
		dirty = true;
	}
	const remove = (k: number) => set(draft[kind].filter((_, i) => i !== k));
	const add = (id: string) => set([...draft[kind], ...toRows([id])]);

	async function save() {
		saving = true;
		// Separators at the ends or next to each other do nothing; save the tidy list.
		const menus = {
			inbox: tidySeparators(ids('inbox'), (id) => id === SEP),
			dash: tidySeparators(ids('dash'), (id) => id === SEP),
			v: MENUS_VERSION
		};
		if (await saveSettings({ menus }, 'Menus saved')) dirty = false;
		saving = false;
	}
	function reset() {
		set(toRows(DEFAULT_MENUS[kind]));
	}
</script>

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

<svelte:head><title>Menus · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Menus</h1>
		<p class="text-sm text-muted-foreground">
			Choose the items and their order in the right-click menu. The same list is the “⋯” menu on
			phones. Hidden items still work with their keys and in the command palette (⌘K).
		</p>
	</div>

	{#if saved}
		<Tabs.Root bind:value={kind}>
			<Tabs.List>
				<Tabs.Trigger value="inbox">Inbox</Tabs.Trigger>
				<Tabs.Trigger value="dash">PRs & issues</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
			<Card.Root>
				<Card.Header>
					<Card.Title>In the menu</Card.Title>
					<Card.Description
						>Drag, or use the arrows. Items that do not apply to a thread still stay out of its
						menu, for example Done in the Done view.</Card.Description
					>
				</Card.Header>
				<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-4">
					<SortableList
						items={draft[kind]}
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

					<div class="grid gap-3 border-t pt-4">
						{#each [['main', 'Not in the menu'], ['shortcut', 'One-click shortcuts']] as [group, title] (group)}
							{@const items = unused.filter((i) => i.group === group)}
							{#if items.length}
								<div class="grid gap-1.5">
									<h3 class="text-xs font-medium text-muted-foreground">{title}</h3>
									<div class="flex flex-wrap gap-1.5">
										{#each items as i (i.id)}
											{@const Icon = iconOf(i.id)}
											<Button
												variant="outline"
												size="sm"
												class="h-7 font-normal"
												title={i.note}
												onclick={() => add(i.id)}
												><Plus class="opacity-60" /><Icon class="opacity-60" />{i.label}</Button
											>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
						<div>
							<Button variant="outline" size="sm" class="h-7 font-normal" onclick={() => add(SEP)}
								><Minus class="opacity-60" />Separator</Button
							>
						</div>
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
					For one open thread. With a selection, most items act on all of it.
				</p>
			</div>
		</div>
	{/if}
</div>
