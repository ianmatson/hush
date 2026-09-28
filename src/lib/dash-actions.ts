import { keysOf } from '$lib/keys.svelte';
import type { Component } from 'svelte';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENUS } from '$lib/shared/menus';
import type { DashItem, Turn } from '$lib/shared/types';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Eye from '@lucide/svelte/icons/eye';
import EyeOff from '@lucide/svelte/icons/eye-off';
import Link from '@lucide/svelte/icons/link';
import Undo from '@lucide/svelte/icons/undo-2';
import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
import ExternalLink from '@lucide/svelte/icons/external-link';
import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
import SquareCheck from '@lucide/svelte/icons/square-check';

/** A command's first key, for the hints in menus and the palette (Settings → Keyboard shortcuts). */
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
	copyLinks(ids: string[]): unknown;
	refresh(): unknown;
	toggleShowHidden(): void;
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
	const make = (id: string): MenuEntry | null => {
		switch (id) {
			case 'peek':
				return one ? item(id, 'Peek', PanelRightOpen, () => ctx.peek(one), key('list.peek')) : null;
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
					? item(id, 'Open on GitHub', ExternalLink, () => ctx.open(one, one.url), '⇧O')
					: null;
			case 'move':
				return {
					type: 'sub',
					key: id,
					label: n('Move to'),
					icon: ArrowRightLeft,
					items: ctx.groups.map((g) => moveItem(g, `move-${g.turn}`, g.label))
				};
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
			case 'copy':
				return item(
					id,
					n(ids.length > 1 ? 'Copy links' : 'Copy link'),
					Link,
					() => ctx.copyLinks(ids),
					'C'
				);
			case 'select':
				return one
					? item(
							id,
							ctx.sel.has(one.id) ? 'Deselect' : 'Select',
							SquareCheck,
							() => ctx.sel.toggle(one.id),
							'X'
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
