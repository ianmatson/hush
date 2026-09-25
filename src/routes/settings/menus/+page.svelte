<script lang="ts">
	import type { Component } from 'svelte';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { ListDrag } from '$lib/drag.svelte';
	import { cubicOut } from 'svelte/easing';
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
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
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
	function move(k: number, to: number) {
		if (to < 0 || to >= draft[kind].length) return;
		const list = [...draft[kind]];
		const [x] = list.splice(k, 1);
		list.splice(to, 0, x);
		set(list);
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

	// Drag to reorder: the same controller and feel as the PR and issue dashboards (mouse and pen;
	// the arrows do the same on touch screens).
	const drag = new ListDrag({
		enabled: () => true,
		pick: (key) => [key],
		isCollapsed: () => false,
		drop: (keys, _zone, index) => {
			const moving = draft[kind].filter((r) => keys.includes(r.key));
			const left = draft[kind].filter((r) => !keys.includes(r.key));
			left.splice(index, 0, ...moving);
			set(left);
		}
	});
	/** Rows to show: the dragged row leaves the list, and a gap opens where it will land. */
	const shown = $derived.by(() => {
		const list: { key: string; row: Row | null }[] = draft[kind]
			.filter((r) => !drag.ids.includes(r.key))
			.map((r) => ({ key: r.key, row: r }));
		if (drag.active)
			list.splice(Math.min(drag.index, list.length), 0, { key: '__placeholder', row: null });
		return list;
	});
	const FLIP = { duration: 220, easing: cubicOut };
	function enter(node: Element, r: { row: Row | null }) {
		if (!r.row)
			return drag.fresh ? { duration: 0 } : slide(node, { duration: 180, easing: cubicOut });
		return drag.active || drag.settling ? { duration: 0 } : fly(node, { y: -6, duration: 180 });
	}
	function leave(node: Element, r: { row: Row | null }) {
		if (!r.row)
			return drag.settling ? { duration: 0 } : slide(node, { duration: 180, easing: cubicOut });
		return drag.active || drag.settling
			? { duration: 0 }
			: slide(node, { duration: 180, easing: cubicOut });
	}
</script>

{#snippet menuRow(row: Row, k: number)}
	{@const Icon = iconOf(row.id)}
	<div
		class="flex min-w-0 cursor-grab items-center gap-2 px-1.5 py-1 text-sm active:cursor-grabbing"
	>
		<GripVertical class="hidden size-4 shrink-0 text-muted-foreground/60 sm:block" />
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
		<span class="flex shrink-0 items-center" data-no-drag>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Move up"
				disabled={k <= 0}
				onclick={() => move(k, k - 1)}><ChevronUp /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Move down"
				disabled={k < 0 || k === draft[kind].length - 1}
				onclick={() => move(k, k + 1)}><ChevronDown /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Remove from the menu"
				onclick={() => remove(k)}><X /></Button
			>
		</span>
	</div>
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
					<div data-drag-root>
						<section data-drag-zone="menu">
							<ul
								class="relative grid grid-cols-[minmax(0,1fr)] gap-0.5"
								aria-label="Menu items in order"
							>
								{#each shown as r (r.key)}
									<li
										animate:flip={FLIP}
										in:enter={r}
										out:leave={r}
										data-drag-id={r.row?.key}
										data-drag-placeholder={!r.row || undefined}
										style={r.row ? undefined : `height: ${drag.gap}px`}
										class={r.row
											? 'drag-row rounded-lg bg-card'
											: 'rounded-lg border-2 border-dashed border-primary/25 bg-primary/[0.05]'}
										onpointerdown={(e) => r.row && drag.pointerdown(e, r.row.key, e.currentTarget)}
									>
										{#if r.row}{@render menuRow(r.row, draft[kind].indexOf(r.row))}{/if}
									</li>
								{/each}
								{#if !draft[kind].length}
									<li class="px-2 py-3 text-sm text-muted-foreground">The menu is empty.</li>
								{/if}
							</ul>
						</section>
					</div>

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

{#if drag.active}
	{@const row = draft[kind].find((r) => r.key === drag.ids[0])}
	{@const lift = drag.lift.current}
	<!-- The row under the pointer, lifted (the same look as a dragged PR card). -->
	<div
		class="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
		style="width: {drag.width}px; transform-origin: {drag.grab.x}px {drag.grab
			.y}px; transform: translate3d({drag.pos.current.x}px, {drag.pos.current.y}px, 0) scale({1 -
			0.04 * lift});"
	>
		<div
			class="rounded-lg border bg-background"
			style="box-shadow: 0 {6 + 16 * lift}px {18 + 30 * lift}px -{10 -
				2 * lift}px rgb(0 0 0 / {0.12 + 0.22 * lift});"
		>
			{#if row}{@render menuRow(row, -1)}{/if}
		</div>
	</div>
{/if}
