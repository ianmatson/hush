import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HOVER_CLOSE_DELAY_MS,
	HOVER_OPEN_DELAY_MS,
	itemHover,
	type HoveredItem
} from './item-hover.svelte';

const zone = (name: string) => ({ name }) as unknown as HTMLElement;
const entry = (id: string) => ({ item: { id }, marks: [] }) as unknown as HoveredItem;
const shownId = () => itemHover.shown?.entry.item.id ?? null;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	itemHover.close();
	vi.useRealTimers();
});

describe('itemHover', () => {
	it('opens only after the pointer rests', () => {
		const row = zone('a');
		itemHover.intend(row, entry('a'), 10);
		vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 100);
		itemHover.follow(row, 20);
		vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 100);
		expect(shownId()).toBeNull();
		vi.advanceTimersByTime(100);
		expect(shownId()).toBe('a');
	});

	it('moves to the next row at once while a card shows', () => {
		const a = zone('a');
		const b = zone('b');
		itemHover.intend(a, entry('a'), 10);
		vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
		itemHover.leave(a);
		itemHover.intend(b, entry('b'), 10);
		expect(shownId()).toBe('b');
		vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
		expect(shownId()).toBe('b');
	});

	it('closes after the pointer leaves the row', () => {
		const a = zone('a');
		itemHover.intend(a, entry('a'), 10);
		vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
		itemHover.leave(a);
		vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
		expect(shownId()).toBeNull();
	});

	it('never opens a card that was dismissed while it waited', () => {
		itemHover.intend(zone('a'), entry('a'), 10);
		itemHover.close();
		vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS * 2);
		expect(shownId()).toBeNull();
	});
});
