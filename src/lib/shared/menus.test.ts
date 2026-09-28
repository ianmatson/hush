import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MENUS,
	MENU_ITEMS,
	SEP,
	tidySeparators,
	upgradeMenus,
	validateMenus
} from './menus';

const isSep = (x: string) => x === SEP;

describe('menus', () => {
	it('drops separators at the ends and next to each other', () => {
		expect(tidySeparators([SEP, 'a', SEP, SEP, 'b', SEP], isSep)).toEqual(['a', SEP, 'b']);
		expect(tidySeparators([SEP, SEP], isSep)).toEqual([]);
	});

	it('accepts the defaults and every known item once', () => {
		expect(validateMenus(DEFAULT_MENUS)).toBeNull();
		expect(
			validateMenus({
				inbox: MENU_ITEMS.inbox.map((i) => i.id),
				dash: MENU_ITEMS.dash.map((i) => i.id)
			})
		).toBeNull();
		expect(validateMenus({ inbox: [] })).toBeNull();
	});

	it('refuses unknown items, doubles, and items of the other menu', () => {
		expect(validateMenus({ inbox: ['peek', 'nope'] })).toMatch(/Unknown/);
		expect(validateMenus({ inbox: ['peek', 'peek'] })).toMatch(/twice/);
		expect(validateMenus({ inbox: ['move'] })).toMatch(/Unknown/);
		expect(validateMenus({ dash: ['done'] })).toMatch(/Unknown/);
		expect(validateMenus({ inbox: 'peek' })).toMatch(/list/);
	});

	it('defaults use only known items', () => {
		for (const kind of ['inbox', 'dash'] as const)
			for (const id of DEFAULT_MENUS[kind])
				if (id !== SEP) expect(MENU_ITEMS[kind].some((i) => i.id === id)).toBe(true);
	});

	it('adds a new item once to menus saved before it, and keeps later choices', () => {
		const old = { inbox: ['peek', 'copy', 'read', 'done'], dash: ['peek', 'hide'] };
		expect(upgradeMenus(old).inbox).toEqual(['peek', 'copy', 'rule', 'read', 'not-needed', 'done']);
		expect(upgradeMenus(old).dash).toEqual(['peek', 'hide', 'not-needed']);
		// Saved after an item existed and without it: you removed it, so it stays out.
		expect(upgradeMenus({ ...old, v: 2 }).inbox).toEqual([
			'peek',
			'copy',
			'read',
			'not-needed',
			'done'
		]);
		expect(upgradeMenus({ ...old, v: 3 }).inbox).toEqual(['peek', 'copy', 'read', 'done']);
		expect(upgradeMenus({ inbox: ['done'] }).inbox).toEqual(['done', 'rule', 'not-needed']);
	});
});
