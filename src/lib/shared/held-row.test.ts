import { describe, expect, it } from 'vitest';
import { keepHeldRow } from './held-row';

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe('keepHeldRow', () => {
	it('returns the rows as they are when nothing is held', () => {
		const now = rows('a', 'c');
		expect(keepHeldRow(now, rows('a', 'b', 'c'), null)).toBe(now);
	});

	it('returns the rows as they are when the held row is still listed', () => {
		const now = rows('a', 'b');
		expect(keepHeldRow(now, rows('a', 'b'), 'b')).toBe(now);
	});

	it('puts a held row that left the list back where it was', () => {
		expect(keepHeldRow(rows('a', 'c'), rows('a', 'b', 'c'), 'b')).toEqual(rows('a', 'b', 'c'));
	});

	it('places it after the rows above it that are still listed', () => {
		expect(keepHeldRow(rows('c', 'd'), rows('a', 'b', 'c', 'd'), 'b')).toEqual(rows('b', 'c', 'd'));
	});

	it('keeps the held copy shown before, not a new one', () => {
		const held = { id: 'b', title: 'before' };
		expect(keepHeldRow([{ id: 'a', title: 'x' }], [{ id: 'a', title: 'x' }, held], 'b')[1]).toBe(
			held
		);
	});

	it('cannot bring back a row it never showed', () => {
		const now = rows('a');
		expect(keepHeldRow(now, rows('a'), 'z')).toBe(now);
	});
});
