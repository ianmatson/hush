import { GH_ACTIONS, keyLabel } from './shared/actions';

/** Keyboard shortcuts, as [keys, what they do], for the "?" dialog. */
export type Shortcut = [keys: string, does: string];

export const INBOX_SHORTCUTS: Shortcut[] = [
	['J / K', 'Next / previous'],
	['Shift + J / K', 'Extend the selection'],
	['Space', 'Peek (J / K move while it is open)'],
	['X', 'Select or deselect'],
	['⌘ / Ctrl + A', 'Select all'],
	['⌘ / Ctrl + click', 'Add to selection'],
	['Shift + click', 'Select a range'],
	['Enter / O', 'Main action (review, fix CI, reply…)'],
	['Shift + O', 'Open the thread on GitHub'],
	['E', 'Done'],
	['S', 'Snooze until tomorrow 9:00'],
	['M', 'Mute the thread'],
	['U', 'Mark as read / unread'],
	['C', 'Copy link'],
	['Esc', 'Clear the selection'],
	['R', 'Sync with GitHub now'],
	['/', 'Search'],
	['1 – 9', 'Change view (6 – 9: your saved views)'],
	['⌘ / Ctrl + K', 'Search and commands'],
	['?', 'Show shortcuts']
];

export const DASH_SHORTCUTS: Shortcut[] = [
	['J / K', 'Next / previous'],
	['Shift + J / K', 'Extend the selection'],
	['Space', 'Peek (J / K move while it is open)'],
	['X', 'Select or deselect'],
	['⌘ / Ctrl + A', 'Select all'],
	['⌘ / Ctrl + click', 'Add to selection'],
	['Shift + click', 'Select a range'],
	['Drag ⋮⋮', 'Move to another group or position'],
	['Enter / O', 'Main action (review, fix CI…)'],
	['Shift + O', 'Open on GitHub'],
	['E', 'Hide until it changes (or show again)'],
	['C', 'Copy link'],
	['H', 'Show hidden items'],
	['Esc', 'Clear the selection'],
	['0 – 9', 'All, or one section'],
	['R', 'Refresh from GitHub'],
	['/', 'Filter'],
	['⌘ / Ctrl + K', 'Search and commands'],
	['?', 'Show shortcuts']
];

/**
 * Keys for actions on GitHub, while the peek shows a PR or issue. From the action table, so
 * custom keys (later) show here too. One line per key (Close and Reopen share X).
 */
export const PEEK_ACTION_SHORTCUTS: Shortcut[] = Object.values(
	Object.values(GH_ACTIONS).reduce<Record<string, string[]>>((byKey, a) => {
		if (a.key) (byKey[a.key] ??= []).push(a.label);
		return byKey;
	}, {})
).map((labels) => {
	const key = Object.values(GH_ACTIONS).find((a) => a.label === labels[0])!.key!;
	return [keyLabel(key), `In the peek: ${labels.join(' / ')}`];
});
