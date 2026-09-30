/**
 * Every keyboard shortcut in Hush, in one table. Handlers ask "which command is this key?"
 * (commandFor in lib/keys.svelte.ts); the help dialogs, the palette, and Settings → Keyboard
 * shortcuts read the keys from here. Your changes are the `keys` setting: for each command id,
 * the keys that replace its defaults ([] turns it off).
 *
 * How a key is written: letters are lower case, with Shift as a modifier ("Shift+j", not "J").
 * Modifiers come first, in the order Mod, Alt, Shift. "Mod" is ⌘ on a Mac and Ctrl elsewhere. Named keys use their KeyboardEvent names ("Enter", "ArrowDown", "Escape");
 * the space bar is "Space". Other characters are themselves, without Shift ("?", "/", "1").
 */

/** Where a command works. Scopes that are active together must not share a key. */
export type KeyScope = 'global' | 'list' | 'inbox' | 'dash' | 'peek' | 'editor';

export interface KeyCommand {
	id: string;
	label: string;
	scope: KeyScope;
	keys: string[];
}

export const SCOPE_LABEL: Record<KeyScope, string> = {
	global: 'Everywhere',
	list: 'Lists (inbox and dashboards)',
	inbox: 'Inbox',
	dash: 'Pull requests and issues',
	peek: 'Peek: actions on GitHub',
	editor: 'Text boxes'
};

/** The scopes that are active at the same time as each scope (a key must be unique there). */
const TOGETHER: Record<KeyScope, KeyScope[]> = {
	global: ['global', 'list', 'inbox', 'dash', 'peek'],
	list: ['global', 'list', 'inbox', 'dash', 'peek'],
	inbox: ['global', 'list', 'inbox', 'peek'],
	dash: ['global', 'list', 'dash', 'peek'],
	peek: ['global', 'list', 'inbox', 'dash', 'peek'],
	editor: ['editor']
};

const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const COMMANDS: KeyCommand[] = [
	{ id: 'palette', label: 'Search and commands', scope: 'global', keys: ['Mod+k'] },

	{ id: 'list.next', label: 'Next', scope: 'list', keys: ['j', 'ArrowDown'] },
	{ id: 'list.prev', label: 'Previous', scope: 'list', keys: ['k', 'ArrowUp'] },
	{ id: 'list.extendNext', label: 'Extend the selection down', scope: 'list', keys: ['Shift+j'] },
	{ id: 'list.extendPrev', label: 'Extend the selection up', scope: 'list', keys: ['Shift+k'] },
	{ id: 'list.select', label: 'Select or deselect', scope: 'list', keys: ['x'] },
	{ id: 'list.selectAll', label: 'Select all', scope: 'list', keys: ['Mod+a'] },
	{ id: 'list.peek', label: 'Peek (open or close)', scope: 'list', keys: ['Space'] },
	{
		id: 'list.escape',
		label: 'Close the peek, or clear the selection',
		scope: 'list',
		keys: ['Escape']
	},
	{
		id: 'list.open',
		label: 'Main action (review, fix CI, reply…)',
		scope: 'list',
		keys: ['o', 'Enter']
	},
	{ id: 'list.openGitHub', label: 'Open on GitHub', scope: 'list', keys: ['Shift+o'] },
	{ id: 'list.copy', label: 'Copy link', scope: 'list', keys: ['c'] },
	{ id: 'list.refresh', label: 'Sync with GitHub now', scope: 'list', keys: ['r'] },
	{ id: 'list.search', label: 'Search', scope: 'list', keys: ['/'] },
	{ id: 'list.help', label: 'Show shortcuts', scope: 'list', keys: ['?'] },

	{ id: 'inbox.done', label: 'Done', scope: 'inbox', keys: ['e'] },
	{ id: 'inbox.snooze', label: 'Snooze until tomorrow 9:00', scope: 'inbox', keys: ['s'] },
	{ id: 'inbox.mute', label: 'Mute the thread', scope: 'inbox', keys: ['m'] },
	{ id: 'inbox.read', label: 'Mark as read / unread', scope: 'inbox', keys: ['u'] },
	{ id: 'inbox.notNeeded', label: 'Doesn’t need me…', scope: 'inbox', keys: ['n'] },
	...range(1, 9).map((n) => ({
		id: `inbox.view.${n}`,
		label: `View ${n} (${n <= 5 ? 'built-in' : 'your saved views'})`,
		scope: 'inbox' as const,
		keys: [String(n)]
	})),

	{ id: 'dash.hide', label: 'Hide until it changes (or show again)', scope: 'dash', keys: ['e'] },
	{ id: 'dash.showHidden', label: 'Show hidden items', scope: 'dash', keys: ['h'] },
	{ id: 'dash.mute', label: 'Mute (or unmute)', scope: 'dash', keys: ['m'] },
	{ id: 'dash.notNeeded', label: 'Not my turn…', scope: 'dash', keys: ['n'] },
	...range(0, 9).map((n) => ({
		id: `dash.section.${n}`,
		label: n === 0 ? 'Section: all' : `Section ${n}`,
		scope: 'dash' as const,
		keys: [String(n)]
	})),

	{ id: 'peek.approve', label: 'Approve', scope: 'peek', keys: ['a'] },
	{ id: 'peek.requestChanges', label: 'Request changes', scope: 'peek', keys: ['Shift+a'] },
	{ id: 'peek.comment', label: 'Comment', scope: 'peek', keys: ['Shift+c'] },
	{ id: 'peek.rerun', label: 'Re-run failed jobs', scope: 'peek', keys: ['Shift+r'] },
	{ id: 'peek.merge', label: 'Merge (press twice)', scope: 'peek', keys: ['Shift+m'] },
	{ id: 'peek.closeReopen', label: 'Close or reopen', scope: 'peek', keys: ['Shift+x'] },

	{ id: 'editor.send', label: 'Send the comment', scope: 'editor', keys: ['Mod+Enter'] },
	{ id: 'editor.suggestNext', label: 'Suggestions: next', scope: 'editor', keys: ['ArrowDown'] },
	{ id: 'editor.suggestPrev', label: 'Suggestions: previous', scope: 'editor', keys: ['ArrowUp'] },
	{
		id: 'editor.suggestPick',
		label: 'Suggestions: use this one',
		scope: 'editor',
		keys: ['Enter', 'Tab']
	},
	{ id: 'editor.suggestClose', label: 'Suggestions: close', scope: 'editor', keys: ['Escape'] },
	{ id: 'editor.save', label: 'Save settings.json', scope: 'editor', keys: ['Mod+s'] }
];

export const COMMAND = new Map(COMMANDS.map((c) => [c.id, c]));

/** The parts of a KeyboardEvent that matter (the Worker has no DOM types). */
type KeyLike = {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
};
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/** The key of a key press, in the form above; null for a bare modifier. */
export function chordOf(e: KeyLike): string | null {
	if (MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') return null;
	let key = e.key === ' ' ? 'Space' : e.key;
	const letter = /^[a-z]$/i.test(key);
	const char = key.length === 1 && !letter;
	if (letter) key = key.toLowerCase();
	const mods = [
		e.metaKey || e.ctrlKey ? 'Mod' : null,
		e.altKey ? 'Alt' : null,
		// A character such as "?" already says Shift.
		e.shiftKey && !char ? 'Shift' : null
	].filter(Boolean);
	return [...mods, key].join('+');
}

const NAMED = new Set([
	'Enter',
	'Escape',
	'Space',
	'Tab',
	'Backspace',
	'Delete',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	...range(1, 12).map((n) => `F${n}`)
]);

/** Is this a key in the form above? */
export function validChord(chord: unknown): chord is string {
	if (typeof chord !== 'string') return false;
	const parts = chord.split('+');
	const key = parts.pop()!;
	const mods = parts;
	const order = ['Mod', 'Alt', 'Shift'];
	if (
		mods.some((m, i) => !order.includes(m) || (i && order.indexOf(m) <= order.indexOf(mods[i - 1])))
	)
		return false;
	if (/^[a-z]$/.test(key) || NAMED.has(key)) return true;
	// Other characters: one character, not a capital letter, no Shift.
	return key.length === 1 && !/[A-Z\s]/.test(key) && !mods.includes('Shift');
}

/** The keys in effect: your changes over the defaults. */
export function bindings(changes: Record<string, string[]> = {}): Map<string, string[]> {
	return new Map(COMMANDS.map((c) => [c.id, changes[c.id] ?? c.keys]));
}

/** The command a key runs in these scopes (the first scope wins), or null. */
export function commandIn(
	map: Map<string, string[]>,
	chord: string,
	scopes: KeyScope[]
): string | null {
	for (const scope of scopes)
		for (const c of COMMANDS) if (c.scope === scope && map.get(c.id)?.includes(chord)) return c.id;
	return null;
}

/** Commands that share a key with this one where both are active (the key, and who has it). */
export function conflicts(map: Map<string, string[]>, id: string, chord: string): KeyCommand[] {
	const own = COMMAND.get(id);
	if (!own) return [];
	return COMMANDS.filter(
		(c) => c.id !== id && TOGETHER[own.scope].includes(c.scope) && map.get(c.id)?.includes(chord)
	);
}

/** A key for people: "⌘ K" on a Mac, "Ctrl + K" elsewhere; arrows and Space by name. */
export function keyText(chord: string, mac: boolean): string {
	const parts = chord.split('+');
	const key = parts.pop()!;
	const name: Record<string, string> = {
		ArrowUp: '↑',
		ArrowDown: '↓',
		ArrowLeft: '←',
		ArrowRight: '→',
		Escape: 'Esc',
		Space: 'Space',
		Enter: mac ? '↩' : 'Enter'
	};
	const shown = name[key] ?? (key.length === 1 ? key.toUpperCase() : key);
	const mod: Record<string, string> = mac
		? { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
		: { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
	return [...parts.map((m) => mod[m]), shown].join(mac ? ' ' : ' + ');
}

/** Check the `keys` setting. Returns an error message, or null. */
export function validateKeys(v: unknown): string | null {
	if (typeof v !== 'object' || v === null || Array.isArray(v))
		return '"keys" must be an object: { "command id": ["key", …] }.';
	for (const [id, list] of Object.entries(v)) {
		if (!COMMAND.has(id)) return `"keys": unknown command "${id}".`;
		if (!Array.isArray(list) || list.length > 4)
			return `"keys.${id}" must be a list of up to 4 keys.`;
		for (const k of list) if (!validChord(k)) return `"keys.${id}": "${String(k)}" is not a key.`;
	}
	return null;
}
