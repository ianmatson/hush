/**
 * The right-click and "⋯" menu, as a saved list of item ids (Settings → Menus). Ids not in the
 * list are hidden. `sep` is a separator. Items that do not apply to an item ("Open on GitHub"
 * when it equals the main action) are still left out when the menu opens.
 */
export type MenuKind = 'dash';
export const SEP = 'sep';

export interface MenuItemInfo {
	id: string;
	label: string;
	/** When the item shows, or what it holds. */
	note?: string;
	/** "shortcut": a one-click copy of a choice from a submenu. */
	group: 'main' | 'shortcut';
}

export const MENU_ITEMS: Record<MenuKind, MenuItemInfo[]> = {
	dash: [
		{ id: 'peek', label: 'Peek', group: 'main' },
		{ id: 'page', label: 'Open full page', note: 'Pull requests and issues', group: 'main' },
		{ id: 'main', label: 'Main action', note: 'Review, Reply, Fix CI…', group: 'main' },
		{
			id: 'github',
			label: 'Open on GitHub',
			note: 'When it differs from the main action',
			group: 'main'
		},
		{
			id: 'categories',
			label: 'Categories',
			note: 'One submenu for each category group',
			group: 'main'
		},
		{
			id: 'snooze',
			label: 'Snooze… / Wake up',
			note: 'Until new activity, a time, or an event',
			group: 'main'
		},
		{
			id: 'mute',
			label: 'Mute / Unmute',
			note: 'Out of the list until you unmute it',
			group: 'main'
		},
		{ id: 'read', label: 'Mark as read / unread', group: 'main' },
		{ id: 'copy', label: 'Copy link', group: 'main' },
		{ id: 'select', label: 'Select / Deselect', group: 'main' },
		{ id: 'selectAll', label: 'Select all', group: 'main' }
	]
};

export const DEFAULT_MENUS: Record<MenuKind, string[]> = {
	dash: [
		'peek',
		'page',
		'main',
		'github',
		SEP,
		'categories',
		'snooze',
		'mute',
		'read',
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
export const MENUS_VERSION = 8;
const ADDED: { kind: MenuKind; id: string; after: string; version: number }[] = [
	{ kind: 'dash', id: 'mute', after: 'snooze', version: 4 },
	{ kind: 'dash', id: 'page', after: 'peek', version: 6 },
	{ kind: 'dash', id: 'categories', after: SEP, version: 7 },
	{ kind: 'dash', id: 'snooze', after: 'categories', version: 8 },
	{ kind: 'dash', id: 'read', after: 'mute', version: 8 }
];

/** Saved menus, upgraded to the current version. */
export function upgradeMenus(
	saved: Partial<Record<MenuKind, string[]>> & { v?: number }
): Record<MenuKind, string[]> & { v: number } {
	const known = (kind: MenuKind) => (id: string) =>
		id === SEP || MENU_ITEMS[kind].some((i) => i.id === id);
	const out = {
		dash: (saved.dash ?? DEFAULT_MENUS.dash).filter(known('dash')),
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
	for (const kind of ['dash'] as MenuKind[]) {
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
