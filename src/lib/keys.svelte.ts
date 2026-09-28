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
export const currentBindings = () => bindings(keymap.changes);

/** The command this key press runs in these scopes (the first scope wins), or null. */
export function commandFor(e: KeyboardEvent, scopes: KeyScope[]): string | null {
	const chord = chordOf(e);
	return chord ? commandIn(currentBindings(), chord, scopes) : null;
}

/** A command's keys as people read them ("⌘ K", "Shift + A"). */
export function keysOf(id: string): string[] {
	return (currentBindings().get(id) ?? []).map((k) => keyText(k, isMac));
}
