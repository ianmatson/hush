import { describe, expect, it } from 'vitest';
import { Selection } from './selection.svelte';

const order = ['a', 'b', 'c', 'd', 'e'];
const click = (mods: Partial<MouseEvent> = {}) =>
	({ shiftKey: false, metaKey: false, ctrlKey: false, ...mods }) as MouseEvent;

describe('Selection', () => {
	it('Cmd/Ctrl-click adds and removes one row at a time', () => {
		const s = new Selection();
		s.click(click({ metaKey: true }), 'b', order);
		s.click(click({ ctrlKey: true }), 'd', order);
		expect([...s.ids]).toEqual(['b', 'd']);
		s.click(click({ metaKey: true }), 'b', order);
		expect([...s.ids]).toEqual(['d']);
	});

	it('Shift-click selects the range from the anchor', () => {
		const s = new Selection();
		s.click(click({ metaKey: true }), 'b', order);
		s.click(click({ shiftKey: true }), 'd', order);
		expect(s.targets(order, null)).toEqual(['b', 'c', 'd']);
	});

	it('Shift-click after a plain click starts the range at the cursor row', () => {
		const s = new Selection();
		// A plain click only moves the cursor to "b"; nothing is selected yet.
		expect(s.click(click({ shiftKey: true }), 'e', order, 'b')).toBe(true);
		expect(s.targets(order, null)).toEqual(['b', 'c', 'd', 'e']);
	});

	it('works upwards too', () => {
		const s = new Selection();
		s.click(click({ shiftKey: true }), 'a', order, 'c');
		expect(s.targets(order, null)).toEqual(['a', 'b', 'c']);
	});
});
