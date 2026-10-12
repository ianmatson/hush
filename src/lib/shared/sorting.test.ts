import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VIEW_SORT,
	dirLabel,
	isDefaultSort,
	sortItemsBy,
	sortOfView,
	sortWithBy,
	viewSortError
} from './sorting';
import type { DashItem, ViewSort } from './types';

const item = (id: string, over: Partial<DashItem> = {}): DashItem =>
	({
		id,
		kind: 'pr',
		title: id,
		turn: 'them',
		priority: 0,
		urgent: false,
		waitingSince: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
		createdAt: '2026-09-01T00:00:00Z',
		comments: 0,
		additions: 0,
		deletions: 0,
		...over
	}) as DashItem;

const ids = (items: DashItem[]) => items.map((i) => i.id);
const sort = (over: Partial<ViewSort>): ViewSort => ({ ...DEFAULT_VIEW_SORT, ...over });

describe('sortItemsBy', () => {
	const old = item('old', { turn: 'you', updatedAt: '2026-10-01T00:00:00Z' });
	const fresh = item('fresh', { turn: 'them', updatedAt: '2026-10-10T00:00:00Z' });
	const middle = item('middle', { turn: 'team', updatedAt: '2026-10-05T00:00:00Z' });

	it('keeps the turn order by default', () => {
		expect(ids(sortItemsBy([fresh, middle, old], DEFAULT_VIEW_SORT))).toEqual([
			'old',
			'middle',
			'fresh'
		]);
	});

	it('reverses the turn order', () => {
		expect(ids(sortItemsBy([fresh, middle, old], sort({ dir: 'desc' })))).toEqual([
			'fresh',
			'middle',
			'old'
		]);
	});

	it('sorts by the key alone when your turn does not come first', () => {
		const s = sort({ by: 'updated', dir: 'desc', turnFirst: false });
		expect(ids(sortItemsBy([old, middle, fresh], s))).toEqual(['fresh', 'middle', 'old']);
	});

	it('keeps your turn first, then sorts each band', () => {
		const mineOld = item('mine-old', { turn: 'you', updatedAt: '2026-10-02T00:00:00Z' });
		const mineNew = item('mine-new', { turn: 'you', updatedAt: '2026-10-09T00:00:00Z' });
		const s = sort({ by: 'updated', dir: 'desc', turnFirst: true });
		expect(ids(sortItemsBy([fresh, mineOld, middle, mineNew], s))).toEqual([
			'mine-new',
			'mine-old',
			'middle',
			'fresh'
		]);
	});

	it('sorts by size, comments, and title', () => {
		const big = item('big', { additions: 500, deletions: 20 });
		const small = item('small', { additions: 3, deletions: 1, comments: 9, title: 'Zebra' });
		const noisy = item('noisy', { additions: 50, comments: 30, title: 'apple' });
		const flat = { turnFirst: false };
		expect(ids(sortItemsBy([big, small, noisy], sort({ by: 'size', ...flat })))).toEqual([
			'small',
			'noisy',
			'big'
		]);
		expect(
			ids(sortItemsBy([big, small, noisy], sort({ by: 'comments', dir: 'desc', ...flat })))
		).toEqual(['noisy', 'small', 'big']);
		expect(ids(sortItemsBy([small, noisy], sort({ by: 'title', ...flat })))).toEqual([
			'noisy',
			'small'
		]);
	});

	it('puts issues after pull requests by size, in both directions, in turn order', () => {
		const big = item('big', { additions: 900 });
		const small = item('small', { additions: 2 });
		const issueMine = item('issue-mine', { kind: 'issue', turn: 'you' });
		const issueTheirs = item('issue-theirs', { kind: 'issue', turn: 'them' });
		const all = [issueTheirs, big, issueMine, small];
		const flat = { by: 'size' as const, turnFirst: false };
		expect(ids(sortItemsBy(all, sort({ ...flat, dir: 'asc' })))).toEqual([
			'small',
			'big',
			'issue-mine',
			'issue-theirs'
		]);
		expect(ids(sortItemsBy(all, sort({ ...flat, dir: 'desc' })))).toEqual([
			'big',
			'small',
			'issue-mine',
			'issue-theirs'
		]);
	});
});

describe('view sort helpers', () => {
	it('falls back to the turn order', () => {
		expect(sortOfView({})).toEqual(DEFAULT_VIEW_SORT);
		expect(isDefaultSort(DEFAULT_VIEW_SORT)).toBe(true);
		expect(isDefaultSort(sort({ dir: 'desc' }))).toBe(false);
	});

	it('starts each key in its natural direction and keeps turnFirst', () => {
		const s = sortWithBy(sort({ turnFirst: false }), 'updated');
		expect(s).toEqual({ by: 'updated', dir: 'desc', turnFirst: false });
		expect(dirLabel(s)).toBe('Newest first');
	});

	it('checks a stored sort', () => {
		expect(viewSortError(sort({ by: 'waiting' }))).toBeNull();
		expect(viewSortError(null)).toMatch(/object/);
		expect(viewSortError({ by: 'nope', dir: 'asc', turnFirst: true })).toMatch(/sort\.by/);
	});
});
