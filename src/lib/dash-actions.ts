import { keysOf } from '$lib/keys.svelte';
import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENUS } from '$lib/shared/menus';
import type { PinChange } from '$lib/shared/categories';
import { itemPagePath } from '$lib/shared/item-page';
import type { CategoryGroup, DashItem, Turn } from '$lib/shared/types';
import FolderInput from '@lucide/svelte/icons/folder-input';
import Sparkles from '@lucide/svelte/icons/sparkles';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Eye from '@lucide/svelte/icons/eye';
import EyeOff from '@lucide/svelte/icons/eye-off';
import Link from '@lucide/svelte/icons/link';
import Undo from '@lucide/svelte/icons/undo-2';
import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
import ExternalLink from '@lucide/svelte/icons/external-link';
import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
import Maximize2 from '@lucide/svelte/icons/maximize-2';
import SquareCheck from '@lucide/svelte/icons/square-check';
import CircleSlash from '@lucide/svelte/icons/circle-slash';
import BellOff from '@lucide/svelte/icons/bell-off';

/** A command's first key, for the hints in menus and the palette (Settings → Keybinds). */
const key = (id: string) => keysOf(id)[0];

export interface TurnGroup {
	turn: Turn;
	label: string;
	hint: string;
}

/**
 * What the dashboard's menus and ⌘K commands act on. The component passes getters, so each call
 * reads the current list, groups, and selection.
 */
export interface DashActionContext {
	/** "pull requests" or "issues". */
	readonly noun: string;
	readonly showHidden: boolean;
	/** The groups this dashboard shows (issues have no team group). */
	readonly groups: TurnGroup[];
	/** The visible items' ids, in list order. */
	readonly order: string[];
	/** Your menu order (Settings → Menus). */
	readonly menu: string[] | undefined;
	readonly sel: Selection;
	byId(id: string): DashItem | undefined;
	peek(i: DashItem): void;
	open(i: DashItem, url: string): void;
	moveTo(ids: string[], turn: Turn): unknown;
	arrange(ids: string[], turn: Turn | null): unknown;
	toggleHide(ids: string[]): unknown;
	/** Mute (hidden until unmuted, and its threads muted), or unmute. */
	toggleMute(ids: string[]): unknown;
	copyLinks(ids: string[]): unknown;
	refresh(): unknown;
	toggleShowHidden(): void;
	/** Ask why an item in Your turn is not your turn ("Not my turn…"). */
	notNeeded(i: DashItem): void;
	readonly categoryGroups: CategoryGroup[];
	pinCategory(ids: string[], change: PinChange): unknown;
}

/** ⌘K commands: refresh and hidden items, then actions on the cursor row or the selection. */
export function dashCommands(ctx: DashActionContext, ids: string[]): PaletteCommand[] {
	const cmds: PaletteCommand[] = [
		{
			id: 'act:refresh',
			label: `Refresh ${ctx.noun} from GitHub`,
			icon: RefreshCw,
			shortcut: key('list.refresh'),
			run: () => ctx.refresh()
		},
		{
			id: 'act:hidden',
			label: ctx.showHidden ? `Show ${ctx.noun}` : 'Show hidden items',
			icon: ctx.showHidden ? Eye : EyeOff,
			shortcut: key('dash.showHidden'),
			run: () => ctx.toggleShowHidden()
		}
	];
	if (!ids.length) return cmds;
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const detail = one ? one.title : `${ids.length} selected`;
	const add = (c: Omit<PaletteCommand, 'detail'>) => cmds.unshift({ ...c, detail });
	// unshift: added in reverse, so row actions come first, in this ctx.order.
	add({
		id: 'act:copy',
		label: ids.length > 1 ? 'Copy links' : 'Copy link',
		icon: Link,
		shortcut: key('list.copy'),
		run: () => ctx.copyLinks(ids)
	});
	add({
		id: 'act:hide',
		label: ctx.showHidden ? 'Show again' : 'Hide until it changes',
		icon: ctx.showHidden ? Eye : EyeOff,
		shortcut: key('dash.hide'),
		run: () => ctx.toggleHide(ids)
	});
	add({
		id: 'act:mute',
		label: one?.muted ? 'Unmute' : 'Mute',
		icon: BellOff,
		shortcut: key('dash.mute'),
		keywords: ['hide', 'forever', 'ignore'],
		run: () => ctx.toggleMute(ids)
	});
	if (one?.turn === 'you' && !one.dismissed)
		add({
			id: 'act:not-needed',
			label: 'Not my turn…',
			icon: CircleSlash,
			shortcut: key('dash.notNeeded'),
			keywords: ['wrong', 'fyi', 'doesn’t need me'],
			run: () => ctx.notNeeded(one)
		});
	if (ids.some((id) => ctx.byId(id)?.movedByYou))
		add({ id: 'act:undomove', label: 'Undo move', icon: Undo, run: () => ctx.arrange(ids, null) });
	for (const g of [...ctx.groups].reverse())
		if (!ids.every((id) => ctx.byId(id)?.turn === g.turn))
			add({
				id: `act:move:${g.turn}`,
				label: `Move to ${g.label}`,
				icon: ArrowRightLeft,
				run: () => ctx.moveTo(ids, g.turn)
			});
	if (one) {
		add({
			id: 'act:open',
			label: one.actionLabel,
			icon: ExternalLink,
			shortcut: key('list.open'),
			run: () => ctx.open(one, one.actionUrl)
		});
		add({
			id: 'act:peek',
			label: 'Peek',
			icon: PanelRightOpen,
			shortcut: key('list.peek'),
			run: () => ctx.peek(one)
		});
		add({
			id: 'act:page',
			label: 'Open full page',
			icon: Maximize2,
			shortcut: key('list.fullPage'),
			run: () => goto(itemPagePath(one.repo, one.number, one.kind))
		});
	}
	return cmds;
}

/** The menu for these items, in your saved ctx.order, with only the items that apply. */
export function dashMenu(ctx: DashActionContext, ids: string[]): MenuEntry[] {
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const n = (label: string) => (ids.length > 1 ? `${label} (${ids.length})` : label);
	const item = (
		key: string,
		label: string,
		icon: Component,
		run: () => void,
		shortcut?: string,
		disabled = false
	): MenuEntry => ({ type: 'item', key, label, icon, run, shortcut, disabled });
	const moveItem = (g: TurnGroup, key: string, label: string) =>
		item(
			key,
			label,
			ArrowRightLeft,
			() => ctx.moveTo(ids, g.turn),
			undefined,
			ids.every((id) => ctx.byId(id)?.turn === g.turn)
		);
	const groupMenu = (g: CategoryGroup): MenuEntry => {
		const has = (c: string) => ids.every((x) => ctx.byId(x)?.categories?.includes(c));
		const pinned = ids.some((x) =>
			g.categories.some((c) => ctx.byId(x)?.pinnedCategories?.includes(c.id))
		);
		return {
			type: 'sub',
			key: `group-${g.id}`,
			label: n(g.name),
			icon: FolderInput,
			items: [
				...g.categories.map((c): MenuEntry => {
					const checked = has(c.id);
					return {
						type: 'item',
						key: `category-${c.id}`,
						label: c.name,
						mark: { color: c.color, icon: c.icon },
						checked,
						run: () =>
							ctx.pinCategory(ids, {
								category: c.id,
								state: g.multiple && checked ? 'off' : 'on'
							})
					};
				}),
				...(pinned
					? ([
							{ type: 'sep', key: `group-${g.id}-sep` },
							item(`group-${g.id}-auto`, 'Choose automatically', Sparkles, () =>
								ctx.pinCategory(ids, { group: g.id, state: 'auto' })
							)
						] satisfies MenuEntry[])
					: [])
			]
		};
	};
	const make = (id: string): MenuEntry | MenuEntry[] | null => {
		switch (id) {
			case 'peek':
				return one ? item(id, 'Peek', PanelRightOpen, () => ctx.peek(one), key('list.peek')) : null;
			case 'page':
				return one
					? item(
							id,
							'Open full page',
							Maximize2,
							() => goto(itemPagePath(one.repo, one.number, one.kind)),
							key('list.fullPage')
						)
					: null;
			case 'main':
				return one
					? item(
							id,
							one.actionLabel,
							ExternalLink,
							() => ctx.open(one, one.actionUrl),
							key('list.open')
						)
					: null;
			case 'github':
				return one && one.url !== one.actionUrl
					? item(
							id,
							'Open on GitHub',
							ExternalLink,
							() => ctx.open(one, one.url),
							key('list.openGitHub')
						)
					: null;
			case 'move':
				if (!ids.length) return null;
				return {
					type: 'sub',
					key: id,
					label: n('Move to'),
					icon: ArrowRightLeft,
					items: ctx.groups.map((g) => moveItem(g, `move-${g.turn}`, g.label))
				};
			case 'categories':
				return ids.length
					? ctx.categoryGroups.filter((g) => g.categories.length).map(groupMenu)
					: null;
			case 'undoMove':
				return ids.some((x) => ctx.byId(x)?.movedByYou)
					? item(id, n('Undo move'), Undo, () => ctx.arrange(ids, null))
					: null;
			case 'hide':
				return ctx.showHidden
					? item(id, n('Show again'), Eye, () => ctx.toggleHide(ids), key('dash.hide'))
					: item(
							id,
							n('Hide until it changes'),
							EyeOff,
							() => ctx.toggleHide(ids),
							key('dash.hide')
						);
			case 'mute':
				return item(
					id,
					n(one?.muted || (!one && ctx.showHidden) ? 'Unmute' : 'Mute'),
					BellOff,
					() => ctx.toggleMute(ids),
					key('dash.mute')
				);
			case 'not-needed':
				return one?.turn === 'you' && !one.dismissed
					? item(id, 'Not my turn…', CircleSlash, () => ctx.notNeeded(one), key('dash.notNeeded'))
					: null;
			case 'copy':
				return item(
					id,
					n(ids.length > 1 ? 'Copy links' : 'Copy link'),
					Link,
					() => ctx.copyLinks(ids),
					key('list.copy')
				);
			case 'select':
				return one
					? item(
							id,
							ctx.sel.has(one.id) ? 'Deselect' : 'Select',
							SquareCheck,
							() => ctx.sel.toggle(one.id),
							key('list.select')
						)
					: null;
			case 'selectAll':
				return item(
					id,
					'Select all',
					SquareCheck,
					() => ctx.sel.all(ctx.order),
					key('list.selectAll')
				);
		}
		const g = ctx.groups.find((x) => `move:${x.turn}` === id);
		return g ? moveItem(g, id, n(`Move to ${g.label}`)) : null;
	};
	return buildMenu(ctx.menu ?? DEFAULT_MENUS.dash, make);
}
