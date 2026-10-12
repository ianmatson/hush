import { keysOf } from '$lib/keys.svelte';
import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENUS } from '$lib/shared/menus';
import type { CategoryPin } from '$lib/shared/categories';
import { itemPagePath } from '$lib/shared/item-page';
import type { CategoryGroup, DashItem, DashProject, GroupBy, ViewSort } from '$lib/shared/types';
import { groupByOptions } from '$lib/shared/grouping';
import { SORT_BY, SORT_BY_ORDER, dirLabel, reversedSort, sortWithBy } from '$lib/shared/sorting';
import type { SnoozeChoice } from '$lib/shared/item-snooze';
import { UNTIL_NEW_ACTIVITY } from '$lib/item-actions';
import { COMMAND, type KeyScope } from '$lib/shared/keymap';
import { alreadyTrue } from '$lib/shared/snooze';
import { snoozeOptions } from '$lib/time';
import FolderInput from '@lucide/svelte/icons/folder-input';
import Sparkles from '@lucide/svelte/icons/sparkles';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';
import Mail from '@lucide/svelte/icons/mail';
import MailOpen from '@lucide/svelte/icons/mail-open';
import CheckCheck from '@lucide/svelte/icons/check-check';
import Link from '@lucide/svelte/icons/link';
import Rows3 from '@lucide/svelte/icons/rows-3';
import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
import ExternalLink from '@lucide/svelte/icons/external-link';
import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
import Maximize2 from '@lucide/svelte/icons/maximize-2';
import SquareCheck from '@lucide/svelte/icons/square-check';
import BellOff from '@lucide/svelte/icons/bell-off';

/** A command's first key, for the hints in menus and the palette (Settings → Keybinds). */
const key = (id: string) => keysOf(id)[0];

export const VIEW_KEY_SCOPES: KeyScope[] = ['list', 'item', 'dash'];

export const anyUnread = (ctx: ItemActionContext, ids: string[]) =>
	ids.some((id) => ctx.byId(id)?.unread);

export interface ItemActionContext {
	byId(id: string): DashItem | undefined;
	snooze(ids: string[], choice: SnoozeChoice): unknown;
	unsnooze(ids: string[]): unknown;
	toggleMute(ids: string[]): unknown;
	setRead(ids: string[], read: boolean): unknown;
	copyLinks(ids: string[]): unknown;
}

/**
 * What the dashboard's menus and ⌘K commands act on. The component passes getters, so each call
 * reads the current list, groups, and selection.
 */
export interface DashActionContext extends ItemActionContext {
	/** "pull requests" or "issues". */
	readonly noun: string;
	readonly showSnoozed: boolean;
	readonly unreadCount: number;
	readonly groupBy: GroupBy;
	readonly hasSections: boolean;
	setGroupBy(by: GroupBy): void;
	readonly sort: ViewSort;
	setSort(sort: ViewSort): void;
	/** The visible items' ids, in list order. */
	readonly order: string[];
	/** Your menu order (Settings → Menus). */
	readonly menu: string[] | undefined;
	readonly sel: Selection;
	peek(i: DashItem): void;
	open(i: DashItem, url: string): void;
	snoozeSheet(ids: string[]): void;
	markAllRead(): unknown;
	refresh(): unknown;
	toggleShowSnoozed(): void;
	readonly categoryGroups: CategoryGroup[];
	readonly projects: DashProject[];
	pinCategory(ids: string[], pin: CategoryPin): unknown;
}

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
			id: 'act:snoozed',
			label: ctx.showSnoozed ? `Show ${ctx.noun}` : 'Show snoozed and muted items',
			icon: ctx.showSnoozed ? AlarmClockOff : AlarmClock,
			shortcut: key('dash.showSnoozed'),
			run: () => ctx.toggleShowSnoozed()
		},
		...(ctx.unreadCount
			? [
					{
						id: 'act:read-all',
						label: 'Mark all as read',
						icon: CheckCheck,
						keywords: ['unread', 'seen', 'clear'],
						run: () => ctx.markAllRead()
					}
				]
			: []),
		...groupByOptions(ctx.categoryGroups, ctx.projects, ctx.hasSections)
			.filter((o) => o.id !== ctx.groupBy)
			.map((o) => ({
				id: `act:group-by:${o.id}`,
				label: `Group by ${o.kind === 'basic' || o.kind === 'field' ? o.label.toLowerCase() : o.label}`,
				icon: Rows3,
				keywords: ['group', 'sections', 'sort'],
				run: () => ctx.setGroupBy(o.id)
			})),
		...SORT_BY_ORDER.filter((by) => by !== ctx.sort.by).map((by) => ({
			id: `act:sort-by:${by}`,
			label: `Sort by ${SORT_BY[by].label.toLowerCase()}`,
			icon: ArrowUpDown,
			keywords: ['sort', 'order'],
			run: () => ctx.setSort(sortWithBy(ctx.sort, by))
		})),
		{
			id: 'act:sort-reverse',
			label: `Sort: ${dirLabel(reversedSort(ctx.sort))}`,
			icon: ArrowUpDown,
			keywords: ['sort', 'order', 'reverse'],
			run: () => ctx.setSort(reversedSort(ctx.sort))
		}
	];
	if (!ids.length) return cmds;
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const detail = one ? one.title : `${ids.length} selected`;
	const rowCommands = itemCommands(ctx, ids, {
		snoozed: ctx.showSnoozed,
		detail,
		keyScopes: VIEW_KEY_SCOPES
	});
	if (!one) return [...rowCommands, ...cmds];
	const oneRowCommands: PaletteCommand[] = [
		{
			id: 'act:page',
			label: 'Open full page',
			icon: Maximize2,
			shortcut: key('list.fullPage'),
			run: () => goto(itemPagePath(one.repo, one.number, one.kind))
		},
		{
			id: 'act:peek',
			label: 'Peek',
			icon: PanelRightOpen,
			shortcut: key('list.peek'),
			run: () => ctx.peek(one)
		},
		{
			id: 'act:open',
			label: one.actionLabel,
			icon: ExternalLink,
			shortcut: key('list.open'),
			run: () => ctx.open(one, one.actionUrl)
		}
	];
	return [...oneRowCommands.map((c) => ({ ...c, detail })), ...rowCommands, ...cmds];
}

export function itemCommands(
	ctx: ItemActionContext,
	ids: string[],
	{ snoozed, detail, keyScopes }: { snoozed: boolean; detail: string; keyScopes: KeyScope[] }
): PaletteCommand[] {
	const shortcut = (id: string) => {
		const scope = COMMAND.get(id)?.scope;
		return scope && keyScopes.includes(scope) ? key(id) : undefined;
	};
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const read = anyUnread(ctx, ids);
	const snoozeCommands: PaletteCommand[] = snoozed
		? [
				{
					id: 'act:wake',
					label: 'Wake up',
					icon: AlarmClockOff,
					shortcut: shortcut('dash.snooze'),
					run: () => ctx.unsnooze(ids)
				}
			]
		: [
				{
					id: 'act:snooze',
					label: 'Snooze until new activity',
					icon: AlarmClock,
					shortcut: shortcut('dash.snooze'),
					run: () => ctx.snooze(ids, UNTIL_NEW_ACTIVITY)
				},
				...snoozeOptions().map((opt) => ({
					id: `act:snooze:${opt.id}`,
					label: /^\d/.test(opt.label) ? `Snooze for ${opt.label}` : `Snooze until ${opt.label}`,
					icon: AlarmClock,
					shortcut: opt.id === 'tomorrow' ? shortcut('dash.snoozeTomorrow') : undefined,
					run: () => ctx.snooze(ids, { until: opt.until })
				}))
			];
	const markCommands: PaletteCommand[] = [
		{
			id: 'act:mute',
			label: one?.muted ? 'Unmute' : 'Mute',
			icon: BellOff,
			shortcut: shortcut('dash.mute'),
			keywords: ['hide', 'forever', 'ignore'],
			run: () => ctx.toggleMute(ids)
		},
		...snoozeCommands,
		{
			id: 'act:read',
			label: read ? 'Mark as read' : 'Mark as unread',
			icon: read ? MailOpen : Mail,
			shortcut: shortcut('dash.read'),
			run: () => ctx.setRead(ids, read)
		}
	];
	const copyCommand: PaletteCommand = {
		id: 'act:copy',
		label: ids.length > 1 ? 'Copy links' : 'Copy link',
		icon: Link,
		shortcut: shortcut('list.copy'),
		run: () => ctx.copyLinks(ids)
	};
	const itemsInViews = ids.some((id) => ctx.byId(id));
	const commands = itemsInViews ? [...markCommands, copyCommand] : [copyCommand];
	return commands.map((c) => ({ ...c, detail }));
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
				...g.categories.map((c): MenuEntry => ({
					type: 'item',
					key: `category-${c.id}`,
					label: c.name,
					mark: { color: c.color, icon: c.icon },
					checked: has(c.id),
					run: () => ctx.pinCategory(ids, { group: g.id, category: c.id })
				})),
				...(pinned
					? ([
							{ type: 'sep', key: `group-${g.id}-sep` },
							item(`group-${g.id}-auto`, 'Choose automatically', Sparkles, () =>
								ctx.pinCategory(ids, { group: g.id, category: null })
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
			case 'categories':
				return ids.length
					? ctx.categoryGroups.filter((g) => g.categories.length).map(groupMenu)
					: null;
			case 'snooze':
				if (ctx.showSnoozed)
					return item(id, n('Wake up'), AlarmClockOff, () => ctx.unsnooze(ids), key('dash.snooze'));
				return {
					type: 'snooze',
					key: id,
					label: n('Snooze'),
					icon: AlarmClock,
					untilNewActivity: true,
					subjects: ids.map((x) => ctx.byId(x)?.kind ?? 'other'),
					disabled: ids.length === 1 && one ? alreadyTrue(one) : [],
					onpick: (choice) => ctx.snooze(ids, choice),
					sheet: () => ctx.snoozeSheet(ids)
				};
			case 'read': {
				const read = anyUnread(ctx, ids);
				return item(
					id,
					n(read ? 'Mark as read' : 'Mark as unread'),
					read ? MailOpen : Mail,
					() => ctx.setRead(ids, read),
					key('dash.read')
				);
			}
			case 'mute':
				return item(
					id,
					n(one?.muted || (!one && ctx.showSnoozed) ? 'Unmute' : 'Mute'),
					BellOff,
					() => ctx.toggleMute(ids),
					key('dash.mute')
				);
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
		return null;
	};
	return buildMenu(ctx.menu ?? DEFAULT_MENUS.dash, make);
}
