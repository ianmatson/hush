import { describe, expect, it } from 'vitest';
import { menuSpot } from './caret';

const menu = { width: 288, height: 340 };
const phone = { left: 0, top: 0, width: 390, height: 844, zoom: 1, fixedOrigin: { x: 0, y: 0 } };

describe('menuSpot', () => {
	it('puts the menu under the caret when it fits', () => {
		expect(menuSpot({ x: 40, y: 100, line: 20 }, phone, menu)).toEqual({
			x: 40,
			y: 124,
			above: false,
			scale: 1
		});
	});

	it('puts the menu over the caret when there is more room above', () => {
		expect(menuSpot({ x: 40, y: 700, line: 20 }, phone, menu)).toEqual({
			x: 40,
			y: 696,
			above: true,
			scale: 1
		});
	});

	it('keeps the menu inside the right edge', () => {
		expect(menuSpot({ x: 300, y: 100, line: 20 }, phone, menu).x).toBe(94);
	});

	it('follows the zoomed-in part of the page, not the whole window', () => {
		const zoomed = {
			left: 500,
			top: 1200,
			width: 330,
			height: 300,
			zoom: 1,
			fixedOrigin: { x: 0, y: 0 }
		};
		expect(menuSpot({ x: 520, y: 1420, line: 20 }, zoomed, menu)).toEqual({
			x: 520,
			y: 1416,
			above: true,
			scale: 1
		});
		expect(menuSpot({ x: 900, y: 1250, line: 20 }, zoomed, menu)).toEqual({
			x: 534,
			y: 1274,
			above: false,
			scale: 1
		});
	});

	it('keeps the left edge in view when the menu is wider than the view', () => {
		const narrow = {
			left: 200,
			top: 0,
			width: 250,
			height: 600,
			zoom: 1,
			fixedOrigin: { x: 0, y: 0 }
		};
		expect(menuSpot({ x: 300, y: 50, line: 20 }, narrow, menu).x).toBe(208);
	});

	it('shrinks the menu back to its normal size on screen while you zoom in', () => {
		const zoomed = {
			left: 100,
			top: 400,
			width: 195,
			height: 422,
			zoom: 2,
			fixedOrigin: { x: 0, y: 0 }
		};
		expect(menuSpot({ x: 250, y: 450, line: 10 }, zoomed, menu)).toEqual({
			x: 147,
			y: 462,
			above: false,
			scale: 0.5
		});
	});

	it('turns screen positions into fixed positions when the two differ, as in Safari', () => {
		const pannedInSafari = {
			left: 100,
			top: 400,
			width: 195,
			height: 422,
			zoom: 2,
			fixedOrigin: { x: -100, y: -400 }
		};
		expect(menuSpot({ x: 30, y: 50, line: 10 }, pannedInSafari, menu)).toEqual({
			x: 130,
			y: 462,
			above: false,
			scale: 0.5
		});
	});
});
