import { describe, expect, it } from 'vitest';
import { fitItems } from './fit';

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
