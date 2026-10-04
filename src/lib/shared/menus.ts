import { SNOOZE_EVENTS } from './snooze';

/**
 * The right-click and "⋯" menus, as saved lists of item ids (Settings → Menus). Ids not in a
 * list are hidden. `sep` is a separator. Items that do not apply to a thread (Done in the Done
 * view, "Open on GitHub" when it equals the main action) are still left out when the menu opens.
 */
export type MenuKind = 'inbox' | 'dash';
export const SEP = 'sep';

export interface MenuItemInfo {
	id: string;
	label: string;
	/** When the item shows, or what it holds. */
	note?: string;
	/** "shortcut": a one-click copy of a choice from a submenu. */
	group: 'main' | 'shortcut';
}

const SNOOZE_TIMES = [
	['1h', '1 hour'],
	['3h', '3 hours'],
	['tomorrow', 'Tomorrow 9:00'],
	['monday', 'Next Monday 9:00']
] as const;

export const MENU_ITEMS: Record<MenuKind, MenuItemInfo[]> = {
	inbox: [
		{ id: 'peek', label: 'Peek', group: 'main' },
		{ id: 'main', label: 'Main action', note: 'Review, Reply, Fix CI…', group: 'main' },
		{
			id: 'github',
			label: 'Open on GitHub',
			note: 'When it differs from the main action',
			group: 'main'
		},
		{ id: 'done', label: 'Done', note: 'Needs you and FYI', group: 'main' },
		{ id: 'snooze', label: 'Snooze', note: 'Every time and condition', group: 'main' },
		{ id: 'mute', label: 'Mute', note: 'Needs you and FYI', group: 'main' },
		{
			id: 'restore',
			label: 'Move to inbox / Unmute',
			note: 'Snoozed, Done, and Muted',
			group: 'main'
		},
		{ id: 'read', label: 'Mark as read / unread', group: 'main' },
		{ id: 'not-needed', label: 'Doesn’t need me…', note: 'Needs you', group: 'main' },
		{ id: 'copy', label: 'Copy link', group: 'main' },
		{
			id: 'rule',
			label: 'Make a rule…',
			note: 'Opens the rule editor with this repo and type',
			group: 'main'
		},
		{ id: 'select', label: 'Select / Deselect', group: 'main' },
		{ id: 'selectAll', label: 'Select all', group: 'main' },
		...SNOOZE_TIMES.map(([id, label]) => ({
			id: `snooze:${id}`,
			label: /^\d/.test(label) ? `Snooze for ${label}` : `Snooze until ${label}`,
			group: 'shortcut' as const
		})),
		...SNOOZE_EVENTS.map((e) => ({
			id: `until:${e.id}`,
			label: `Snooze until ${e.label.charAt(0).toLowerCase()}${e.label.slice(1)}`,
			note: e.kinds.includes('issue') ? 'Pull requests and issues' : 'Pull requests',
			group: 'shortcut' as const
		}))
	],
	dash: [
		{ id: 'peek', label: 'Peek', group: 'main' },
		{ id: 'main', label: 'Main action', note: 'Review, Reply, Fix CI…', group: 'main' },
		{
			id: 'github',
			label: 'Open on GitHub',
			note: 'When it differs from the main action',
			group: 'main'
		},
		{ id: 'move', label: 'Move to', note: 'Every group', group: 'main' },
		{ id: 'category', label: 'Category', note: 'Choose one, or let Hush decide', group: 'main' },
		{ id: 'tags', label: 'Tags', note: 'Add or remove', group: 'main' },
		{ id: 'undoMove', label: 'Undo move', note: 'Items you moved', group: 'main' },
		{ id: 'hide', label: 'Hide until it changes / Show again', group: 'main' },
		{ id: 'mute', label: 'Mute / Unmute', note: 'Hidden until you unmute it', group: 'main' },
		{ id: 'not-needed', label: 'Not my turn…', note: 'Your turn', group: 'main' },
		{ id: 'copy', label: 'Copy link', group: 'main' },
		{ id: 'select', label: 'Select / Deselect', group: 'main' },
		{ id: 'selectAll', label: 'Select all', group: 'main' },
		{ id: 'move:you', label: 'Move to Your turn', group: 'shortcut' },
		{ id: 'move:team', label: "Move to Your team's turn", group: 'shortcut' },
		{ id: 'move:them', label: 'Move to Waiting on others', group: 'shortcut' },
		{ id: 'move:none', label: 'Move to Other', group: 'shortcut' }
	]
};

export const DEFAULT_MENUS: Record<MenuKind, string[]> = {
	inbox: [
		'peek',
		'main',
		'github',
		SEP,
		'done',
		'snooze',
		'mute',
		'restore',
		'read',
		'not-needed',
		'copy',
		'rule',
		SEP,
		'select',
		'selectAll'
	],
	dash: [
		'peek',
		'main',
		'github',
		SEP,
		'move',
		'category',
		'tags',
		'undoMove',
		'hide',
		'mute',
		'not-needed',
		'copy',
		SEP,
		'select',
		'selectAll'
	]
};

/**
 * Items added after a menu may have been saved. A saved menu older than an item's version gets
 * that item once (after `after`, or at the end); later choices are yours.
 */
export const MENUS_VERSION = 5;
const ADDED: { kind: MenuKind; id: string; after: string; version: number }[] = [
	{ kind: 'inbox', id: 'rule', after: 'copy', version: 2 },
	{ kind: 'inbox', id: 'not-needed', after: 'read', version: 3 },
	{ kind: 'dash', id: 'not-needed', after: 'hide', version: 3 },
	{ kind: 'dash', id: 'mute', after: 'hide', version: 4 },
	{ kind: 'dash', id: 'category', after: 'move', version: 5 },
	{ kind: 'dash', id: 'tags', after: 'category', version: 5 }
];

/** Saved menus, upgraded to the current version. */
export function upgradeMenus(
	saved: Partial<Record<MenuKind, string[]>> & { v?: number }
): Record<MenuKind, string[]> & { v: number } {
	const out = {
		inbox: [...(saved.inbox ?? DEFAULT_MENUS.inbox)],
		dash: [...(saved.dash ?? DEFAULT_MENUS.dash)],
		v: MENUS_VERSION
	};
	for (const a of ADDED) {
		const list = out[a.kind];
		if ((saved.v ?? 1) >= a.version || list.includes(a.id)) continue;
		const at = list.indexOf(a.after);
		list.splice(at < 0 ? list.length : at + 1, 0, a.id);
	}
	return out;
}

/** No separator first, last, or next to another. */
export function tidySeparators<T>(list: T[], isSep: (x: T) => boolean): T[] {
	const out: T[] = [];
	for (const x of list) {
		if (isSep(x) && (!out.length || isSep(out[out.length - 1]))) continue;
		out.push(x);
	}
	while (out.length && isSep(out[out.length - 1])) out.pop();
	return out;
}

export function validateMenus(m: unknown): string | null {
	if (typeof m !== 'object' || m === null) return 'Menus must be an object.';
	for (const kind of ['inbox', 'dash'] as MenuKind[]) {
		const list = (m as Record<string, unknown>)[kind];
		if (list === undefined) continue;
		if (!Array.isArray(list) || list.length > 60)
			return `The ${kind} menu must be a list of up to 60 items.`;
		const known = new Set(MENU_ITEMS[kind].map((i) => i.id));
		const seen = new Set<string>();
		for (const id of list) {
			if (id === SEP) continue;
			if (typeof id !== 'string' || !known.has(id)) return `Unknown menu item "${String(id)}".`;
			if (seen.has(id)) return `"${id}" is in the menu twice.`;
			seen.add(id);
		}
	}
	return null;
}
