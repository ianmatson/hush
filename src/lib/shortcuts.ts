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
