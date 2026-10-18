import { bindings, chordOf, commandIn, keyText, type KeyScope } from '$lib/shared/keymap';

/**
 * Keyboard shortcuts in the browser: your changes (the `keys` setting, set by the app shell)
 * over the defaults in shared/keymap.ts. Handlers ask commandFor(); buttons and help ask keysOf().
 */
export const keymap = $state<{ changes: Record<string, string[]> }>({ changes: {} });

export const isMac =
	typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function setKeyChanges(changes: Record<string, string[]>) {
	keymap.changes = changes;
}

/** The keys in effect now. */
const currentBindings = () => bindings(keymap.changes);

/** The command this key press runs in these scopes (the first scope wins), or null. */
export function commandFor(e: KeyboardEvent, scopes: KeyScope[]): string | null {
	const chord = chordOf(e);
	return chord ? commandIn(currentBindings(), chord, scopes) : null;
}

/** A command's keys as people read them ("⌘ K", "Shift + A"). */
export function keysOf(id: string): string[] {
	return (currentBindings().get(id) ?? []).map((k) => keyText(k, isMac));
}

const OWNS_ITS_KEYS = 'input, textarea, [contenteditable], [role="menu"], [role="dialog"]';

export function ignoreKey(e: KeyboardEvent): boolean {
	const target = e.target;
	return e.defaultPrevented || (target instanceof Element && !!target.closest(OWNS_ITS_KEYS));
}

const ACTIVATION_KEYS = new Set([' ', 'Enter']);
const ACTIVATES_ON_ENTER_OR_SPACE = [
	'a[href]',
	'button',
	'select',
	'summary',
	'[role="button"]',
	'[role="link"]',
	'[role="checkbox"]',
	'[role="switch"]',
	'[role="radio"]',
	'[role="tab"]',
	'[role="menuitem"]',
	'[role="combobox"]'
].join(', ');

export function keyActivatesFocusedControl(e: KeyboardEvent): boolean {
	const target = e.target;
	return (
		ACTIVATION_KEYS.has(e.key) &&
		target instanceof Element &&
		target.matches(ACTIVATES_ON_ENTER_OR_SPACE)
	);
}
