import { describe, expect, it } from 'vitest';
import {
	hiddenOlderCount,
	keepLoadedOlder,
	PEEK_TIMELINE_PAGE,
	showOlderLabel,
	withOlderPage
} from './peek-timeline';
import type { PeekDTO, PeekEntry } from './types';

const entry = (id: string): PeekEntry => ({
	type: 'comment',
	id,
	author: { login: 'bob', avatar: null, bot: false },
	at: '2026-10-22T00:00:00Z',
	url: `https://github.com/acme/web/pull/1#${id}`,
	html: id
});

const peek = (ids: string[], total: number, before: string | null): PeekDTO =>
	({ repo: 'acme/web', number: 1, timeline: { total, items: ids.map(entry), before } }) as PeekDTO;

const ids = (p: PeekDTO) => p.timeline.items.map((e) => e.id);

describe('withOlderPage', () => {
	it('puts the older page before the shown items and keeps its cursor', () => {
		const next = withOlderPage(peek(['c', 'd'], 4, 'at-c'), 'at-c', {
			items: [entry('a'), entry('b')],
			before: null
		});
		expect(ids(next)).toEqual(['a', 'b', 'c', 'd']);
		expect(next.timeline.before).toBeNull();
		expect(hiddenOlderCount(next)).toBe(0);
	});

	it('ignores a page for a cursor that a refresh replaced', () => {
		const shown = peek(['x', 'y'], 9, 'at-x');
		expect(withOlderPage(shown, 'at-c', { items: [entry('a')], before: null })).toBe(shown);
	});

	it('does not show an item twice', () => {
		const next = withOlderPage(peek(['b', 'c'], 3, 'at-b'), 'at-b', {
			items: [entry('a'), entry('b')],
			before: null
		});
		expect(ids(next)).toEqual(['a', 'b', 'c']);
	});
});

describe('keepLoadedOlder', () => {
	it('keeps loaded older items when a refresh adds a new item', () => {
		const loaded = peek(['a', 'b', 'c', 'd'], 5, 'before-a');
		const fresh = peek(['c', 'd', 'e'], 6, 'at-c');
		const next = keepLoadedOlder(loaded, fresh);
		expect(ids(next)).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(next.timeline.before).toBe('before-a');
		expect(hiddenOlderCount(next)).toBe(1);
	});

	it('keeps an item that the newest page no longer covers, so no gap opens', () => {
		const next = keepLoadedOlder(peek(['b', 'c'], 3, 'at-b'), peek(['c', 'd'], 4, 'at-c'));
		expect(ids(next)).toEqual(['b', 'c', 'd']);
		expect(next.timeline.before).toBe('at-b');
	});

	it('takes the fresh page when it no longer joins the loaded items', () => {
		const fresh = peek(['x', 'y'], 30, 'at-x');
		expect(keepLoadedOlder(peek(['a', 'b'], 4, 'before-a'), fresh)).toBe(fresh);
	});

	it('takes the fresh page when it starts at the first item', () => {
		const fresh = peek(['b', 'c'], 2, null);
		expect(keepLoadedOlder(peek(['a', 'b', 'c'], 3, null), fresh)).toBe(fresh);
	});

	it('takes the fresh page when nothing is cached', () => {
		const fresh = peek(['a'], 1, null);
		expect(keepLoadedOlder(undefined, fresh)).toBe(fresh);
	});
});

describe('showOlderLabel', () => {
	it('counts a full page and the rest', () => {
		const hidden = PEEK_TIMELINE_PAGE + 7;
		expect(showOlderLabel(peek(['a'], hidden + 1, 'at-a'))).toBe(
			`Show ${PEEK_TIMELINE_PAGE} older of ${hidden}`
		);
	});

	it('counts the last page', () => {
		expect(showOlderLabel(peek(['a'], 3, 'at-a'))).toBe('Show 2 older');
	});

	it('still offers older items when kept items that were deleted make the count wrong', () => {
		expect(showOlderLabel(peek(['a', 'b', 'c'], 2, 'before-a'))).toBe('Show older');
	});

	it('offers nothing at the first item', () => {
		expect(showOlderLabel(peek(['a'], 1, null))).toBeNull();
	});
});
