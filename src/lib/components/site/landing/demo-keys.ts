import { COMMAND, keyText } from '$lib/shared/keymap';

const SHOWS_MAC_KEYS = true;

export function demoKey(commandId: string, index = 0): string {
	const key = COMMAND.get(commandId)?.keys[index];
	if (!key) throw new Error(`The demo shows a key that "${commandId}" does not have`);
	return keyText(key, SHOWS_MAC_KEYS);
}
