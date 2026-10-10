import { COMMANDS, type KeyScope } from './shared/keymap';
import { keysOf } from './keys.svelte';

/** Keyboard shortcuts, as [keys, what they do], for the "?" dialog. */
export type Shortcut = [keys: string, does: string];

/** Numbered commands (views, sections) show as one line: "1 – 9". */
const NUMBERED: Record<string, string> = {
	'dash.view': 'Open a view'
};

/** Mouse actions next to the keys (not keyboard shortcuts, so not editable). */
export const LIST_MOUSE: Shortcut[] = [
	['⌘ / Ctrl + click', 'Add to selection'],
	['Shift + click', 'Select a range']
];
/** The shortcuts of these scopes, with your keys (Settings → Keybinds). */
export function shortcutsFor(scopes: KeyScope[], extra: Shortcut[] = []): Shortcut[] {
	const out: Shortcut[] = [];
	const done = new Set<string>();
	for (const c of COMMANDS) {
		if (!scopes.includes(c.scope)) continue;
		const group = c.id.match(/^(dash\.view)\.\d+$/)?.[1];
		if (group) {
			if (done.has(group)) continue;
			done.add(group);
			const keys = COMMANDS.filter((x) => x.id.startsWith(`${group}.`))
				.map((x) => keysOf(x.id)[0])
				.filter(Boolean);
			if (keys.length) out.push([`${keys[0]} – ${keys.at(-1)}`, NUMBERED[group]]);
			continue;
		}
		const keys = keysOf(c.id);
		if (keys.length) out.push([keys.join(' / '), c.label]);
	}
	return [...out, ...extra];
}
