import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MENUS,
	MENU_ITEMS,
	MENUS_VERSION,
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
		expect(validateMenus({ dash: MENU_ITEMS.dash.map((i) => i.id) })).toBeNull();
		expect(validateMenus({ dash: [] })).toBeNull();
	});

	it('refuses unknown items, doubles, and items of the removed inbox', () => {
		expect(validateMenus({ dash: ['peek', 'nope'] })).toMatch(/Unknown/);
		expect(validateMenus({ dash: ['peek', 'peek'] })).toMatch(/twice/);
		expect(validateMenus({ dash: ['done'] })).toMatch(/Unknown/);
		expect(validateMenus({ dash: 'peek' })).toMatch(/list/);
	});

	it('defaults use only known items', () => {
		for (const id of DEFAULT_MENUS.dash)
			if (id !== SEP) expect(MENU_ITEMS.dash.some((i) => i.id === id)).toBe(true);
	});

	it('adds a new item once to menus saved before it, and drops the inbox menu', () => {
		const old = { inbox: ['peek', 'copy', 'read', 'done'], dash: ['peek', 'hide'] };
		expect(upgradeMenus(old)).toEqual({
			dash: ['peek', 'page', 'mute', 'read', 'categories', 'snooze'],
			v: MENUS_VERSION
		});
		expect(upgradeMenus({ dash: ['peek'], v: 8 }).dash).toEqual(['peek']);
	});

	it('drops items that are gone, and adds the new ones', () => {
		const saved = {
			dash: ['move', 'category', 'tags', 'undoMove', 'hide', 'not-needed'],
			v: 6
		};
		expect(upgradeMenus(saved).dash).toEqual(['categories', 'snooze', 'read']);
	});

	it('turns the last default dashboard menu into the new default', () => {
		const lastDefault = [
			'peek',
			'page',
			'main',
			'github',
			SEP,
			'categories',
			'hide',
			'mute',
			'copy',
			SEP,
			'select',
			'selectAll'
		];
		expect(upgradeMenus({ dash: lastDefault, v: 7 }).dash).toEqual(DEFAULT_MENUS.dash);
	});
});
