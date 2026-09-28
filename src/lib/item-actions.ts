import { keysOf } from '$lib/keys.svelte';
import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import type { ActionBody, ItemAction } from '$lib/api';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENU, MENU_ITEMS } from '$lib/shared/menus';
import { alreadyTrue, eventsFor, subjectKind } from '$lib/shared/snooze';
import { formatQuery } from '$lib/shared/query';
import type { ItemDTO } from '$lib/shared/types';
import { snoozeOptions } from '$lib/time';
import Check from '@lucide/svelte/icons/check';
import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import BellOff from '@lucide/svelte/icons/bell-off';
import Undo from '@lucide/svelte/icons/undo-2';
import ExternalLink from '@lucide/svelte/icons/external-link';
import Link from '@lucide/svelte/icons/link';
import SquareCheck from '@lucide/svelte/icons/square-check';
import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
import Zap from '@lucide/svelte/icons/zap';
import ListFilter from '@lucide/svelte/icons/list-filter';
import CircleSlash from '@lucide/svelte/icons/circle-slash';
import Hand from '@lucide/svelte/icons/hand';

/** A command's first key, for the hints in menus and the palette (Settings → Keybinds). */
const key = (id: string) => keysOf(id)[0];

/**
 * What an item list's menus and ⌘K commands act on. The page passes getters, so each call reads
 * the current list and selection.
 */
export interface ItemActionContext {
	/** The visible items' keys, in list order. */
	readonly order: string[];
	/** Your menu order (the `menu` setting). */
	readonly menu: string[] | undefined;
	readonly sel: Selection;
	byKey(key: string): ItemDTO | undefined;
	peek(t: ItemDTO): void;
	open(t: ItemDTO, url: string): void;
	act(keys: string[], action: ItemAction, body?: ActionBody): unknown;
	/** Ask why an item is not your turn (Not my turn…). */
	notMine(t: ItemDTO): void;
	copyLinks(keys: string[]): unknown;
	/** Open the snooze sheet (phones, and the key) for these items. */
	snoozeSheet(keys: string[]): void;
}

const itemLabel = (id: string) => MENU_ITEMS.find((i) => i.id === id)?.label ?? id;

/** Done, snoozed, or muted: the one way back is "Move back". */
const handled = (t: ItemDTO | undefined) =>
	!!t &&
	(t.state === 'done' ||
		t.state === 'muted' ||
		(t.state === 'snoozed' && (t.snoozedUntil ?? 0) > Date.now()));

/** A rule for an item's repository and type: the query for the rule editor. */
export const ruleQueryFor = (t: ItemDTO) => formatQuery({ repo: t.repo, type: [t.subjectType] });

/** The menu for these items, in your saved order, with only the entries that apply. */
export function itemMenu(ctx: ItemActionContext, keys: string[]): MenuEntry[] {
	const items = keys.map((k) => ctx.byKey(k)).filter((t): t is ItemDTO => !!t);
	const one = items.length === 1 ? items[0] : undefined;
	const n = (label: string) => (keys.length > 1 ? `${label} (${keys.length})` : label);
	const kinds = items.map((t) => subjectKind(t.subjectType));
	const already = one ? alreadyTrue({ ci: one.ci, state: one.prState }) : [];
	const events = eventsFor(kinds);
	const allHandled = items.length > 0 && items.every(handled);
	const item = (
		id: string,
		label: string,
		icon: Component,
		run: () => void,
		shortcut?: string
	): MenuEntry => ({ type: 'item', key: id, label, icon, run, shortcut });
	const make = (id: string): MenuEntry | null => {
		switch (id) {
			case 'peek':
				return one?.number
					? item(id, 'Peek', PanelRightOpen, () => ctx.peek(one), key('list.peek'))
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
			case 'done':
				return allHandled
					? null
					: item(id, n('Done'), Check, () => ctx.act(keys, 'done'), key('item.done'));
			case 'snooze':
				return allHandled
					? null
					: {
							type: 'snooze',
							key: id,
							label: n('Snooze'),
							icon: AlarmClock,
							subjects: kinds,
							disabled: already,
							onpick: (b) => ctx.act(keys, 'snooze', b),
							sheet: () => ctx.snoozeSheet(keys)
						};
			case 'mute':
				return allHandled
					? null
					: item(id, n('Mute'), BellOff, () => ctx.act(keys, 'mute'), key('item.mute'));
			case 'not-mine':
				return one && one.lane === 'turn' && !handled(one)
					? item(id, 'Not my turn…', CircleSlash, () => ctx.notMine(one), key('item.notMine'))
					: null;
			case 'my-turn':
				return one && one.lane !== 'turn' && !handled(one)
					? item(id, 'It is my turn', Hand, () => ctx.act(keys, 'my-turn'), key('item.myTurn'))
					: null;
			case 'restore':
				return items.some((t) => handled(t) || t.override)
					? item(
							id,
							n(one?.state === 'muted' ? 'Unmute' : 'Move back'),
							Undo,
							() => ctx.act(keys, 'restore'),
							key('item.restore')
						)
					: null;
			case 'copy':
				return item(
					id,
					n(keys.length > 1 ? 'Copy links' : 'Copy link'),
					Link,
					() => ctx.copyLinks(keys),
					key('list.copy')
				);
			case 'rule':
				return one
					? item(id, 'Make a rule…', ListFilter, () =>
							goto(`/settings/advanced?rule=${encodeURIComponent(ruleQueryFor(one))}#rules`)
						)
					: null;
			case 'select':
				return one
					? item(
							id,
							ctx.sel.has(one.key) ? 'Deselect' : 'Select',
							SquareCheck,
							() => ctx.sel.toggle(one.key),
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
		if (allHandled) return null;
		const time = snoozeOptions().find((o) => `snooze:${o.id}` === id);
		if (time)
			return item(id, n(itemLabel(id)), AlarmClock, () =>
				ctx.act(keys, 'snooze', { until: time.until })
			);
		const ev = events.find((e) => `until:${e.id}` === id);
		if (ev && !already.includes(ev.id))
			return item(id, n(itemLabel(id)), Zap, () => ctx.act(keys, 'snooze', { event: ev.id }));
		return null;
	};
	return buildMenu(ctx.menu ?? DEFAULT_MENU, make);
}

/** ⌘K commands for the cursor row or the selection. */
export function itemCommands(ctx: ItemActionContext, keys: string[]): PaletteCommand[] {
	if (!keys.length) return [];
	const items = keys.map((k) => ctx.byKey(k)).filter((t): t is ItemDTO => !!t);
	const one = items.length === 1 ? items[0] : undefined;
	const detail = one ? one.title : `${keys.length} selected`;
	const cmds: PaletteCommand[] = [];
	const add = (c: Omit<PaletteCommand, 'detail'>) => cmds.push({ ...c, detail });
	if (one?.number)
		add({
			id: 'act:peek',
			label: 'Peek',
			icon: PanelRightOpen,
			shortcut: key('list.peek'),
			run: () => ctx.peek(one)
		});
	if (one)
		add({
			id: 'act:open',
			label: one.actionLabel,
			icon: ExternalLink,
			shortcut: key('list.open'),
			run: () => ctx.open(one, one.actionUrl)
		});
	if (!items.every(handled)) {
		add({
			id: 'act:done',
			label: 'Done',
			icon: Check,
			shortcut: key('item.done'),
			keywords: ['mark', 'handled'],
			run: () => ctx.act(keys, 'done')
		});
		for (const o of snoozeOptions())
			add({
				id: `act:snooze:${o.id}`,
				label: /^\d/.test(o.label) ? `Snooze for ${o.label}` : `Snooze until ${o.label}`,
				icon: AlarmClock,
				run: () => ctx.act(keys, 'snooze', { until: o.until })
			});
		const already = one ? alreadyTrue({ ci: one.ci, state: one.prState }) : [];
		for (const ev of eventsFor(items.map((t) => subjectKind(t.subjectType))))
			if (!already.includes(ev.id))
				add({
					id: `act:snooze:${ev.id}`,
					label: `Snooze until ${ev.label.charAt(0).toLowerCase()}${ev.label.slice(1)}`,
					icon: Zap,
					keywords: ['snooze', 'wait'],
					run: () => ctx.act(keys, 'snooze', { event: ev.id })
				});
		add({
			id: 'act:mute',
			label: 'Mute',
			icon: BellOff,
			shortcut: key('item.mute'),
			run: () => ctx.act(keys, 'mute')
		});
		if (one?.lane === 'turn')
			add({
				id: 'act:not-mine',
				label: 'Not my turn…',
				icon: CircleSlash,
				shortcut: key('item.notMine'),
				run: () => ctx.notMine(one)
			});
		else if (one)
			add({
				id: 'act:my-turn',
				label: 'It is my turn',
				icon: Hand,
				shortcut: key('item.myTurn'),
				run: () => ctx.act(keys, 'my-turn')
			});
	}
	if (items.some((t) => handled(t) || t.override))
		add({
			id: 'act:restore',
			label: one?.state === 'muted' ? 'Unmute' : 'Move back',
			icon: Undo,
			shortcut: key('item.restore'),
			run: () => ctx.act(keys, 'restore')
		});
	add({
		id: 'act:copy',
		label: keys.length > 1 ? 'Copy links' : 'Copy link',
		icon: Link,
		shortcut: key('list.copy'),
		run: () => ctx.copyLinks(keys)
	});
	add({
		id: 'act:all',
		label: 'Select all',
		icon: SquareCheck,
		shortcut: key('list.selectAll'),
		run: () => ctx.sel.all(ctx.order)
	});
	return cmds;
}
