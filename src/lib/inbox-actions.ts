import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import type { ThreadAction } from '$lib/api';
import { buildMenu, type MenuEntry } from '$lib/menu';
import type { PaletteCommand } from '$lib/palette.svelte';
import type { Selection } from '$lib/selection.svelte';
import { DEFAULT_MENUS, MENU_ITEMS } from '$lib/shared/menus';
import { alreadyTrue, eventsFor, subjectKind } from '$lib/shared/snooze';
import type { ThreadDTO, View } from '$lib/shared/types';
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

/**
 * What the inbox's menus and ⌘K commands act on. The page passes getters, so each call reads the
 * current view, list, and selection.
 */
export interface InboxActionContext {
	readonly view: View;
	/** Needs you, FYI, or the whole inbox (Done, Snooze, and Mute apply). */
	readonly inInbox: boolean;
	/** The visible threads' ids, in list order. */
	readonly order: string[];
	/** Your menu order (Settings → Menus). */
	readonly menu: string[] | undefined;
	readonly sel: Selection;
	byId(id: string): ThreadDTO | undefined;
	peek(t: ThreadDTO): void;
	open(t: ThreadDTO, url: string): void;
	act(ids: string[], action: ThreadAction, body?: unknown): unknown;
	copyLinks(ids: string[]): unknown;
	/** Open the snooze sheet (phones) for these threads. */
	snoozeSheet(ids: string[]): void;
}

const itemLabel = (id: string) => MENU_ITEMS.inbox.find((i) => i.id === id)?.label ?? id;

/**
 * Read/unread toggle (like Gmail): if any of the threads is unread, mark them all read;
 * otherwise mark them all unread.
 */
export const readAction = (
	ctx: Pick<InboxActionContext, 'byId'>,
	ids: string[]
): 'read' | 'unread' => (ids.some((id) => ctx.byId(id)?.unread) ? 'read' : 'unread');

export const restoreAction = (view: View, t: ThreadDTO | undefined): ThreadAction =>
	view === 'muted' || t?.category === 'muted'
		? 'unmute'
		: view === 'snoozed'
			? 'unsnooze'
			: 'undone';

/** The menu for these threads, in your saved ctx.order, with only the items that apply. */
export function inboxMenu(ctx: InboxActionContext, ids: string[]): MenuEntry[] {
	const one = ids.length === 1 ? ctx.byId(ids[0]) : undefined;
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
				return one?.number ? item(id, 'Peek', PanelRightOpen, () => ctx.peek(one), 'Space') : null;
			case 'main':
				return one
					? item(id, one.actionLabel, ExternalLink, () => ctx.open(one, one.actionUrl), '↵')
					: null;
			case 'github':
				return one && one.htmlUrl !== one.actionUrl
					? item(id, 'Open on GitHub', ExternalLink, () => ctx.open(one, one.htmlUrl), '⇧O')
					: null;
			case 'done':
				return ctx.inInbox ? item(id, n('Done'), Check, () => ctx.act(ids, 'done'), 'E') : null;
			case 'snooze':
				return ctx.inInbox
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
				return ctx.inInbox ? item(id, n('Mute'), BellOff, () => ctx.act(ids, 'mute'), 'M') : null;
			case 'restore':
				return ctx.inInbox
					? null
					: item(id, n(ctx.view === 'muted' ? 'Unmute' : 'Move to inbox'), Undo, () =>
							ctx.act(ids, restoreAction(ctx.view, one))
						);
			case 'read': {
				const r = readAction(ctx, ids);
				return item(
					id,
					n(r === 'read' ? 'Mark as read' : 'Mark as unread'),
					r === 'read' ? MailOpen : Mail,
					() => ctx.act(ids, r),
					'U'
				);
			}
			case 'copy':
				return item(
					id,
					n(ids.length > 1 ? 'Copy links' : 'Copy link'),
					Link,
					() => ctx.copyLinks(ids),
					'C'
				);
			case 'rule':
				return one
					? item(id, 'Make a rule…', ListFilter, () =>
							goto(
								`/settings/inbox?rule=${encodeURIComponent(JSON.stringify({ repo: one.repo, type: [one.subjectType] }))}`
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
							'X'
						)
					: null;
			case 'selectAll':
				return item(id, 'Select all', SquareCheck, () => ctx.sel.all(ctx.order), '⌘A');
		}
		if (!ctx.inInbox) return null;
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
	if (one?.number)
		add({
			id: 'act:peek',
			label: 'Peek',
			icon: PanelRightOpen,
			shortcut: 'Space',
			run: () => ctx.peek(one)
		});
	if (one)
		add({
			id: 'act:open',
			label: one.actionLabel,
			icon: ExternalLink,
			shortcut: '↵',
			run: () => ctx.open(one, one.actionUrl)
		});
	if (ctx.inInbox) {
		add({
			id: 'act:done',
			label: 'Mark as done',
			icon: Check,
			shortcut: 'E',
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
			shortcut: 'M',
			run: () => ctx.act(ids, 'mute')
		});
	} else {
		add({
			id: 'act:restore',
			label: ctx.view === 'muted' ? 'Unmute' : 'Move to inbox',
			icon: Undo,
			run: () => ctx.act(ids, restoreAction(ctx.view, one))
		});
	}
	const read = readAction(ctx, ids);
	add({
		id: 'act:read',
		label: read === 'read' ? 'Mark as read' : 'Mark as unread',
		icon: read === 'read' ? MailOpen : Mail,
		shortcut: 'U',
		run: () => ctx.act(ids, read)
	});
	add({
		id: 'act:copy',
		label: ids.length > 1 ? 'Copy links' : 'Copy link',
		icon: Link,
		shortcut: 'C',
		run: () => ctx.copyLinks(ids)
	});
	add({
		id: 'act:all',
		label: 'Select all',
		icon: SquareCheck,
		shortcut: '⌘A',
		run: () => ctx.sel.all(ctx.order)
	});
	return cmds;
}
