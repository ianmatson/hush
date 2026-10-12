import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TABLE_COLUMNS,
	fitTableColumns,
	shownTableColumns,
	validateRowLayout,
	validateTableColumns
} from './row-layout';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('row layout', () => {
	it('is cards by default', () => {
		expect(DEFAULT_SETTINGS.rowLayout).toBe('cards');
		expect(parseSettings('{}').rowLayout).toBe('cards');
	});

	it('accepts only cards or table', () => {
		expect(validateRowLayout('table')).toBeNull();
		expect(validateRowLayout('cards')).toBeNull();
		expect(validateRowLayout('compact')).toMatch(/"cards" or "table"/);
		expect(parseSettings('{"rowLayout":"compact"}').rowLayout).toBe('cards');
	});
});

describe('table columns', () => {
	it('accept only known columns, once each', () => {
		expect(validateTableColumns(['reason', 'time'])).toBeNull();
		expect(validateTableColumns([])).toBeNull();
		expect(validateTableColumns(['labels'])).toMatch(/unknown column "labels"/);
		expect(validateTableColumns(['time', 'time'])).toMatch(/twice/);
		expect(validateTableColumns('time')).toMatch(/list/);
	});

	it('drop columns that are gone and keep the default when none are stored', () => {
		expect(parseSettings('{"tableColumns":["time","gone","reason"]}').tableColumns).toEqual([
			'reason',
			'time'
		]);
		expect(parseSettings('{}').tableColumns).toEqual(DEFAULT_TABLE_COLUMNS);
	});

	it('show category names instead of the icons when both are on', () => {
		expect(shownTableColumns(['categories', 'time']).map((c) => c.id)).toEqual([
			'categories',
			'time'
		]);
		expect(shownTableColumns(['categories', 'categoryNames']).map((c) => c.id)).toEqual([
			'categoryNames'
		]);
	});

	it('show in a fixed order, whatever order the setting lists them in', () => {
		expect(shownTableColumns(['time', 'author', 'reason']).map((c) => c.id)).toEqual([
			'reason',
			'author',
			'time'
		]);
	});
});

describe('table columns in a narrow row', () => {
	const all = shownTableColumns(['reason', 'repo', 'author', 'ci', 'size', 'comments', 'time']);

	it('keep every column when the row is wide', () => {
		expect(fitTableColumns(all, 100)).toEqual(all);
	});

	it('drop the author first and the time last', () => {
		const ids = (rem: number) => fitTableColumns(all, rem).map((c) => c.id);
		expect(ids(48)).not.toContain('author');
		expect(ids(48)).toContain('reason');
		expect(ids(24)).toEqual(['time']);
		expect(ids(10)).toEqual([]);
	});
});
