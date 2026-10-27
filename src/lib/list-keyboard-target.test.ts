import { describe, expect, it } from 'vitest';
import { listKeyboardTarget } from './list-keyboard-target';
import type { DashItem } from './shared/types';

const row = (id: number, kind = 'pull') =>
	({
		id: `owner/repo#${id}`,
		url: `https://github.com/owner/repo/${kind}/${id}`,
		actionUrl: `https://github.com/owner/repo/${kind}/${id}/files`,
		dismissed: false
	}) as DashItem;

const first = row(1);
const second = row(2);
const issue = row(3, 'issues');
const rows = [first, second, issue];

describe('list keyboard action target', () => {
	it('uses the open peek instead of a different list cursor or bulk selection', () => {
		const target = listKeyboardTarget(second, first, [first.id, issue.id], rows);
		expect(target.ids).toEqual([second.id]);
		expect(target.item).toBe(second);
		expect(target.urls).toEqual([second.url]);
		expect(target.actionUrl).toBe(second.actionUrl);
		expect(target.fullPagePath).toBe('/owner/repo/pull/2');
	});

	it('finds a peek item outside the current list, including another item kind', () => {
		const target = listKeyboardTarget(issue, undefined, [], rows);
		expect(target.ids).toEqual([issue.id]);
		expect(target.item).toBe(issue);
		expect(target.fullPagePath).toBe('/owner/repo/issues/3');
	});

	it('keeps links usable for an untracked stack member without acting on a list row', () => {
		const outside = row(4);
		const target = listKeyboardTarget(outside, first, [first.id], rows);
		expect(target.ids).toEqual([]);
		expect(target.item).toBeUndefined();
		expect(target.target).toBe(outside);
		expect(target.urls).toEqual([outside.url]);
		expect(target.actionUrl).toBe(outside.url);
		expect(target.fullPagePath).toBe('/owner/repo/pull/4');
	});

	it('retains the peek item state when the current view has a different hidden filter', () => {
		const snoozed = { ...second, dismissed: true };
		const target = listKeyboardTarget(snoozed, first, [first.id], [first, snoozed]);
		expect(target.item?.dismissed).toBe(true);
		expect(target.ids).toEqual([second.id]);
	});

	it('uses the list cursor and selection when peek is closed', () => {
		const target = listKeyboardTarget(null, first, [second.id, first.id], rows);
		expect(target.item).toBe(first);
		expect(target.ids).toEqual([second.id, first.id]);
		expect(target.urls).toEqual([second.url, first.url]);
		expect(target.actionUrl).toBe(first.actionUrl);
		expect(target.fullPagePath).toBe('/owner/repo/pull/1');
	});

	it('has no item action when both peek and the list cursor are absent', () => {
		const target = listKeyboardTarget(null, undefined, [], rows);
		expect(target.target).toBeUndefined();
		expect(target.ids).toEqual([]);
		expect(target.urls).toEqual([]);
		expect(target.actionUrl).toBeUndefined();
		expect(target.fullPagePath).toBeNull();
	});
});
