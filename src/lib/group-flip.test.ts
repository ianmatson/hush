import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flipGroup, flipInGroup, recordPlacesInGroups } from './group-flip';

const rect = (left: number, top: number, width = 300, height = 40) =>
	({ left, top, width, height }) as DOMRect;

function fakeElement(at: DOMRect, children: Element[] = []) {
	const el = {
		rect: at,
		clientWidth: at.width,
		clientHeight: at.height,
		currentCSSZoom: 1,
		getBoundingClientRect: () => el.rect,
		querySelectorAll: () => children,
		contains: (other: Element) => children.includes(other)
	};
	return el as unknown as Element & { rect: DOMRect };
}

const FLIP = { duration: 260 };
const start = (config: { css?: (t: number, u: number) => string }) => config.css?.(0, 1);

beforeEach(() => {
	vi.stubGlobal('getComputedStyle', () => ({ transform: 'none', transformOrigin: '0px 0px' }));
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe('flipGroup', () => {
	it('moves the group from its old place without stretching it to its old size', () => {
		const group = fakeElement(rect(0, 140, 300, 200));
		const config = flipGroup(group, { from: rect(0, 100, 300, 120), to: group.rect }, FLIP);
		expect(start(config)).toContain('translate(0px, -40px) scale(1, 1)');
	});
});

describe('flipInGroup', () => {
	it('moves a row only by how far it moved inside its group', () => {
		const row = fakeElement(rect(0, 220));
		const group = fakeElement(rect(0, 200, 300, 200), [row]);
		recordPlacesInGroups([group]);

		group.rect = rect(0, 294, 300, 200);
		row.rect = rect(0, 314);
		const followsGroup = flipInGroup(row, { from: rect(0, 220), to: row.rect }, FLIP);
		expect(start(followsGroup)).toContain('translate(0px, 0px)');

		row.rect = rect(0, 356);
		const movedDown = flipInGroup(row, { from: rect(0, 220), to: row.rect }, FLIP);
		expect(start(movedDown)).toContain('translate(0px, -42px)');
	});

	it('falls back to a plain flip for a row with no recorded group', () => {
		const row = fakeElement(rect(0, 300));
		const config = flipInGroup(row, { from: rect(0, 260), to: row.rect }, FLIP);
		expect(start(config)).toContain('translate(0px, -40px)');
	});
});
