import { describe, expect, it } from 'vitest';
import { DEFAULT_MENU, MENU_ITEMS, SEP, tidySeparators, validateMenu } from './menus';

const isSep = (x: string) => x === SEP;

describe('menus', () => {
	it('drops separators at the ends and next to each other', () => {
		expect(tidySeparators([SEP, 'a', SEP, SEP, 'b', SEP], isSep)).toEqual(['a', SEP, 'b']);
		expect(tidySeparators([SEP, SEP], isSep)).toEqual([]);
	});

	it('accepts the default and every known item once', () => {
		expect(validateMenu(DEFAULT_MENU)).toBeNull();
		expect(validateMenu(MENU_ITEMS.map((i) => i.id))).toBeNull();
		expect(validateMenu([])).toBeNull();
	});

	it('refuses unknown items and doubles', () => {
		expect(validateMenu(['peek', 'nope'])).toMatch(/Unknown/);
		expect(validateMenu(['peek', 'peek'])).toMatch(/twice/);
		expect(validateMenu('peek')).toMatch(/list/);
	});

	it('the default uses only known items', () => {
		for (const id of DEFAULT_MENU)
			if (id !== SEP) expect(MENU_ITEMS.some((i) => i.id === id)).toBe(true);
	});
});
