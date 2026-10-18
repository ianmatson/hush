import { describe, expect, it } from 'vitest';
import { moveItem, randomId, unusedName } from './draft-edits';

describe('moveItem', () => {
	it('moves one item up or down and leaves the list it got alone', () => {
		const list = ['a', 'b', 'c'];
		expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b']);
		expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
		expect(list).toEqual(['a', 'b', 'c']);
	});
});

describe('randomId', () => {
	it('starts with the prefix and fits the id rules of views and categories', () => {
		const id = randomId('view');
		expect(id).toMatch(/^view-[a-z0-9]{1,6}$/);
		expect(id.length).toBeLessThanOrEqual(40);
	});
});

describe('unusedName', () => {
	it('uses the name itself, then the first free number, whatever the case', () => {
		expect(unusedName('New group', [])).toBe('New group');
		expect(unusedName('New group', ['new group ', 'New group 2'])).toBe('New group 3');
	});

	it('can start numbering at once, from a given number', () => {
		expect(unusedName('Section', ['Section 1'], 2)).toBe('Section 2');
		expect(unusedName('Section', ['Section 1', 'section 2'], 2)).toBe('Section 3');
	});
});
