import { SNOOZE_EVENTS } from './snooze';

/**
 * The right-click and "⋯" menu of an item, as a saved list of item ids (the `menu` setting). Ids
 * not in the list are hidden. `sep` is a separator. Items that do not apply to an item (Done for
 * an item that is done, "Open on GitHub" when it equals the main action) are left out when the
 * menu opens.
 */
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

export const MENU_ITEMS: MenuItemInfo[] = [
	{ id: 'peek', label: 'Peek', note: 'Pull requests and issues', group: 'main' },
	{ id: 'main', label: 'Main action', note: 'Review, Reply, Fix CI…', group: 'main' },
	{
		id: 'github',
		label: 'Open on GitHub',
		note: 'When it differs from the main action',
		group: 'main'
	},
	{ id: 'done', label: 'Done', note: 'Until it is your turn again', group: 'main' },
	{ id: 'snooze', label: 'Snooze', note: 'Every time and condition', group: 'main' },
	{ id: 'mute', label: 'Mute', group: 'main' },
	{ id: 'not-mine', label: 'Not my turn…', note: 'Items in Your turn', group: 'main' },
	{ id: 'my-turn', label: 'It is my turn', note: 'Items in Waiting and Updates', group: 'main' },
	{
		id: 'restore',
		label: 'Move back / Unmute',
		note: 'Done, snoozed, and muted items',
		group: 'main'
	},
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
];

export const DEFAULT_MENU: string[] = [
	'peek',
	'main',
	'github',
	SEP,
	'done',
	'snooze',
	'mute',
	'not-mine',
	'my-turn',
	'restore',
	SEP,
	'copy',
	'rule',
	SEP,
	'select',
	'selectAll'
];

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

export function validateMenu(list: unknown): string | null {
	if (!Array.isArray(list) || list.length > 60) return '"menu" must be a list of up to 60 items.';
	const known = new Set(MENU_ITEMS.map((i) => i.id));
	const seen = new Set<string>();
	for (const id of list) {
		if (id === SEP) continue;
		if (typeof id !== 'string' || !known.has(id)) return `Unknown menu item "${String(id)}".`;
		if (seen.has(id)) return `"${id}" is in the menu twice.`;
		seen.add(id);
	}
	return null;
}
