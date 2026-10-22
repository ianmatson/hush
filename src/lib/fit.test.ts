import { describe, expect, it } from 'vitest';
import { fitItems, fitWithTrailingControl } from './fit';

const options = { gap: 4, moreWidth: 30 };

describe('fitItems', () => {
	it('shows every item when they all fit', () => {
		expect(fitItems([50, 50, 50], 200, options)).toEqual([0, 1, 2]);
	});

	it('keeps room for the more button when some do not fit', () => {
		expect(fitItems([50, 50, 50, 50], 150, options)).toEqual([0, 1]);
	});

	it('always shows the kept item, in place of the last ones that fit', () => {
		expect(fitItems([50, 50, 50, 50], 150, { ...options, keep: 3 })).toEqual([0, 3]);
	});

	it('counts the reserved space of other controls', () => {
		expect(fitItems([50, 50], 120, { ...options, reserved: 20 })).toEqual([0]);
	});
});

describe('fitWithTrailingControl', () => {
	const sizes = { gap: 4, moreWidth: 30, controlWidth: 20 };

	it('shows every item and the control when they all fit', () => {
		expect(fitWithTrailingControl([50, 50], 130, sizes)).toBe(2);
	});

	it('swaps the control for the more button when the items do not fit', () => {
		expect(fitWithTrailingControl([50, 50, 50], 150, sizes)).toBe(2);
	});

	it('hides at least one item when only the control does not fit', () => {
		expect(fitWithTrailingControl([50, 50], 110, sizes)).toBe(1);
	});

	it('shows only the more button when no item fits', () => {
		expect(fitWithTrailingControl([200], 100, sizes)).toBe(0);
	});
});
