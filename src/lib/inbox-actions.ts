import { keysOf } from '$lib/keys.svelte';
import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import type { ActionBody, ThreadAction } from '$lib/api';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENUS, MENU_ITEMS } from '$lib/shared/menus';
import { alreadyTrue, eventsFor, subjectKind } from '$lib/shared/snooze';
import { formatQuery } from '$lib/shared/query';
import type { ThreadDTO } from '$lib/shared/types';
import { snoozeOptions } from '$lib/time';
import Check from '@lucide/svelte/icons/check';
import AlarmClock from '@lucide/svelte/icons/alarm-clock';
import BellOff from '@lucide/svelte/icons/bell-off';
import Undo from '@lucide/svelte/icons/undo-2';
import ExternalLink from '@lucide/svelte/icons/external-link';
import Link from '@lucide/svelte/icons/link';
import MailOpen from '@lucide/svelte/icons/mail-open';
import Mail from '@lucide/svelte/icons/mail';
import SquareCheck from '@lucide/svelte/icons/square-check';
import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
import Zap from '@lucide/svelte/icons/zap';
import ListFilter from '@lucide/svelte/icons/list-filter';
import CircleSlash from '@lucide/svelte/icons/circle-slash';

/** A command's first key, for the hints in menus and the palette (Settings → Keybinds). */
const key = (id: string) => keysOf(id)[0];

/**
 * What the inbox's menus and ⌘K commands act on. The page passes getters, so each call reads the
 * current view, list, and selection.
 */
export interface InboxActionContext {
	/** The visible threads' ids, in list order. */
	readonly order: string[];
	/** Your menu order (Settings → Menus). */
	readonly menu: string[] | undefined;
	readonly sel: Selection;
	byId(id: string): ThreadDTO | undefined;
	peek(t: ThreadDTO): void;
	open(t: ThreadDTO, url: string): void;
	act(ids: string[], action: ThreadAction, body?: ActionBody): unknown;
	copyLinks(ids: string[]): unknown;
	/** Open the snooze sheet (phones) for these threads. */
	snoozeSheet(ids: string[]): void;
	/** Ask why a Needs you thread does not need you ("Doesn't need me…"). */
	notNeeded(t: ThreadDTO): void;
}

/** A thread that "Doesn't need me…" applies to: it needs you now, in the inbox. */
export const canSayNotNeeded = (t: ThreadDTO | undefined) =>
	!!t && t.category === 'action' && t.triage !== 'done';

const itemLabel = (id: string) => MENU_ITEMS.inbox.find((i) => i.id === id)?.label ?? id;

/**
 * Read/unread toggle (like Gmail): if any of the threads is unread, mark them all read;
 * otherwise mark them all unread.
 */
export const readAction = (
	ctx: Pick<InboxActionContext, 'byId'>,
	ids: string[]
): 'read' | 'unread' => (ids.some((id) => ctx.byId(id)?.unread) ? 'read' : 'unread');

/**
 * In the inbox now (Needs you or FYI, not Done, snoozed, or muted): Done, Snooze, and Mute apply.
 * The others can go back ("Move to inbox", "Unmute"). Per thread, so a search of every tab works.
 */
export const isOpen = (t: ThreadDTO | undefined) =>
	!!t &&
	t.category !== 'muted' &&
	(t.triage === 'inbox' || (t.triage === 'snoozed' && (t.snoozedUntil ?? 0) <= Date.now()));

/** How a thread that is not open goes back: unmute, unsnooze, or out of Done. */
export const restoreAction = (t: ThreadDTO | undefined): ThreadAction =>
	t?.category === 'muted' ? 'unmute' : t?.triage === 'snoozed' ? 'unsnooze' : 'undone';
export const restoreLabel = (t: ThreadDTO | undefined) =>
	t?.category === 'muted' ? 'Unmute' : 'Move to inbox';

/** The menu for these threads, in your saved ctx.order, with only the items that apply. */
export function inboxMenu(ctx: InboxActionContext, ids: string[]): MenuEntry[] {
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const threads = ids.map((id) => ctx.byId(id));
	const anyOpen = threads.some(isOpen);
	const handled = threads.find((t) => t && !isOpen(t));
	const n = (label: string) => (ids.length > 1 ? `${label} (${ids.length})` : label);
	const kinds = ids.map((id) => subjectKind(ctx.byId(id)?.subjectType ?? ''));
	const already = one ? alreadyTrue(one) : [];
	const events = eventsFor(kinds);
	const item = (
		key: string,
		label: string,
		icon: Component,
		run: () => void,
		shortcut?: string
	): MenuEntry => ({ type: 'item', key, label, icon, run, shortcut });
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
				return one && one.htmlUrl !== one.actionUrl
					? item(
							id,
							'Open on GitHub',
							ExternalLink,
							() => ctx.open(one, one.htmlUrl),
							key('list.openGitHub')
						)
					: null;
			case 'done':
				return anyOpen
					? item(id, n('Done'), Check, () => ctx.act(ids, 'done'), key('inbox.done'))
					: null;
			case 'snooze':
				return anyOpen
					? {
							type: 'snooze',
							key: id,
							label: n('Snooze'),
							icon: AlarmClock,
							subjects: kinds,
							disabled: already,
							onpick: (b) => ctx.act(ids, 'snooze', b),
							sheet: () => ctx.snoozeSheet(ids)
						}
					: null;
			case 'mute':
				return anyOpen
					? item(id, n('Mute'), BellOff, () => ctx.act(ids, 'mute'), key('inbox.mute'))
					: null;
			case 'restore':
				return handled
					? item(id, n(restoreLabel(handled)), Undo, () =>
							ctx.act(
								ids.filter((x) => !isOpen(ctx.byId(x))),
								restoreAction(handled)
							)
						)
					: null;
			case 'read': {
				const r = readAction(ctx, ids);
				return item(
					id,
					n(r === 'read' ? 'Mark as read' : 'Mark as unread'),
					r === 'read' ? MailOpen : Mail,
					() => ctx.act(ids, r),
					key('inbox.read')
				);
			}
			case 'not-needed':
				return one && canSayNotNeeded(one)
					? item(
							id,
							'Doesn’t need me…',
							CircleSlash,
							() => ctx.notNeeded(one),
							key('inbox.notNeeded')
						)
					: null;
			case 'copy':
				return item(
					id,
					n(ids.length > 1 ? 'Copy links' : 'Copy link'),
					Link,
					() => ctx.copyLinks(ids),
					key('list.copy')
				);
			case 'rule':
				return one
					? item(id, 'Make a rule…', ListFilter, () =>
							goto(
								`/settings/inbox?rule=${encodeURIComponent(formatQuery({ repo: one.repo, type: [one.subjectType] }))}`
							)
						)
					: null;
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
		if (!anyOpen) return null;
		const time = snoozeOptions().find((o) => `snooze:${o.id}` === id);
		if (time)
			return item(id, n(itemLabel(id)), AlarmClock, () =>
				ctx.act(ids, 'snooze', { until: time.until })
			);
		const ev = events.find((e) => `until:${e.id}` === id);
		if (ev && !already.includes(ev.id))
			return item(id, n(itemLabel(id)), Zap, () => ctx.act(ids, 'snooze', { event: ev.id }));
		return null;
	};
	return buildMenu(ctx.menu ?? DEFAULT_MENUS.inbox, make);
}

/** ⌘K commands for the cursor row or the selection. */
export function inboxCommands(ctx: InboxActionContext, ids: string[]): PaletteCommand[] {
	if (!ids.length) return [];
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
	const detail = one ? one.title : `${ids.length} selected`;
	const cmds: PaletteCommand[] = [];
	const add = (c: Omit<PaletteCommand, 'detail'>) => cmds.push({ ...c, detail });
	if (one)
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
	const threads = ids.map((id) => ctx.byId(id));
	const handled = threads.find((t) => t && !isOpen(t));
	if (threads.some(isOpen)) {
		add({
			id: 'act:done',
			label: 'Mark as done',
			icon: Check,
			shortcut: key('inbox.done'),
			run: () => ctx.act(ids, 'done')
		});
		for (const o of snoozeOptions())
			add({
				id: `act:snooze:${o.label}`,
				label: /^\d/.test(o.label) ? `Snooze for ${o.label}` : `Snooze until ${o.label}`,
				icon: AlarmClock,
				run: () => ctx.act(ids, 'snooze', { until: o.until })
			});
		const already = one ? alreadyTrue(one) : [];
		for (const ev of eventsFor(ids.map((id) => subjectKind(ctx.byId(id)?.subjectType ?? ''))))
			if (!already.includes(ev.id))
				add({
					id: `act:snooze:${ev.id}`,
					label: `Snooze until ${ev.label.charAt(0).toLowerCase()}${ev.label.slice(1)}`,
					icon: Zap,
					keywords: ['snooze', 'wait'],
					run: () => ctx.act(ids, 'snooze', { event: ev.id })
				});
		add({
			id: 'act:mute',
			label: 'Mute',
			icon: BellOff,
			shortcut: key('inbox.mute'),
			run: () => ctx.act(ids, 'mute')
		});
	}
	if (handled)
		add({
			id: 'act:restore',
			label: restoreLabel(handled),
			icon: Undo,
			run: () =>
				ctx.act(
					ids.filter((x) => !isOpen(ctx.byId(x))),
					restoreAction(handled)
				)
		});
	if (one && canSayNotNeeded(one))
		add({
			id: 'act:not-needed',
			label: 'Doesn’t need me…',
			icon: CircleSlash,
			shortcut: key('inbox.notNeeded'),
			keywords: ['wrong', 'fyi', 'not mine'],
			run: () => ctx.notNeeded(one)
		});
	const read = readAction(ctx, ids);
	add({
		id: 'act:read',
		label: read === 'read' ? 'Mark as read' : 'Mark as unread',
		icon: read === 'read' ? MailOpen : Mail,
		shortcut: key('inbox.read'),
		run: () => ctx.act(ids, read)
	});
	add({
		id: 'act:copy',
		label: ids.length > 1 ? 'Copy links' : 'Copy link',
		icon: Link,
		shortcut: key('list.copy'),
		run: () => ctx.copyLinks(ids)
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
