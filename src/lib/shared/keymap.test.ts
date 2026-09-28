import { describe, expect, it } from 'vitest';
import {
	COMMANDS,
	bindings,
	chordOf,
	commandIn,
	conflicts,
	keyText,
	validChord,
	validateKeys
} from './keymap';

const press = (
	key: string,
	mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>> = {}
) =>
	chordOf({
		key,
		metaKey: !!mods.meta,
		ctrlKey: !!mods.ctrl,
		altKey: !!mods.alt,
		shiftKey: !!mods.shift
	});

describe('keymap', () => {
	it('reads key presses', () => {
		expect(press('j')).toBe('j');
		expect(press('J', { shift: true })).toBe('Shift+j');
		expect(press('k', { meta: true })).toBe('Mod+k');
		expect(press('K', { ctrl: true, shift: true })).toBe('Mod+Shift+k');
		expect(press('?', { shift: true })).toBe('?');
		expect(press(' ')).toBe('Space');
		expect(press('Enter', { meta: true })).toBe('Mod+Enter');
		expect(press('Shift', { shift: true })).toBeNull();
	});

	it('has valid, unique defaults with no conflicts', () => {
		const ids = COMMANDS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		const map = bindings();
		for (const c of COMMANDS)
			for (const k of c.keys) {
				expect(validChord(k)).toBe(true);
				expect(conflicts(map, c.id, k).map((x) => x.id)).toEqual([]);
			}
	});

	it('finds the command for a key in the active scopes', () => {
		const map = bindings();
		expect(commandIn(map, 'e', ['list', 'item'])).toBe('item.done');
		expect(commandIn(map, '2', ['global', 'list'])).toBe('nav.waiting');
		expect(commandIn(map, 'Mod+k', ['global'])).toBe('palette');
		expect(commandIn(map, 'q', ['list', 'item'])).toBeNull();
	});

	it('applies your changes and sees conflicts', () => {
		const map = bindings({ 'item.done': ['d'], 'list.copy': [] });
		expect(commandIn(map, 'd', ['item'])).toBe('item.done');
		expect(commandIn(map, 'e', ['item'])).toBeNull();
		expect(commandIn(map, 'c', ['list'])).toBeNull();
		expect(conflicts(map, 'peek.approve', 'j').map((c) => c.id)).toEqual(['list.next']);
		// Text boxes are never active with the lists.
		expect(conflicts(map, 'editor.save', 'd')).toEqual([]);
	});

	it('shows keys for people', () => {
		expect(keyText('Mod+Shift+k', true)).toBe('⌘ ⇧ K');
		expect(keyText('Mod+k', false)).toBe('Ctrl + K');
		expect(keyText('ArrowDown', false)).toBe('↓');
	});

	it('checks the setting', () => {
		expect(validateKeys({ 'item.done': ['d', 'Shift+d'] })).toBeNull();
		expect(validateKeys({ nope: ['d'] })).toMatch(/unknown command/);
		expect(validateKeys({ 'item.done': ['D'] })).toMatch(/not a key/);
		expect(validateKeys({ 'item.done': ['Shift+Mod+d'] })).toMatch(/not a key/);
		expect(validateKeys({ 'item.done': 'd' })).toMatch(/list/);
		expect(validateKeys([])).toMatch(/object/);
	});
});
