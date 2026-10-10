import { describe, expect, it } from 'vitest';
import { optionScore } from './option-search';

describe('optionScore', () => {
	it('keeps every option when nothing is typed', () => {
		expect(optionScore('created', '  ', ['Opened'])).toBe(1);
	});

	it('ranks the start of a label, then the start of a word, then any part', () => {
		const category = optionScore('category', 'cat', ['Category']);
		const word = optionScore('from', 'act', ['Latest activity by']);
		const inside = optionScore('reviewed-by', 'view', ['Reviewed by']);
		expect(category).toBeGreaterThan(word);
		expect(word).toBeGreaterThan(inside);
		expect(inside).toBeGreaterThan(0);
	});

	it('does not match letters that are only in order', () => {
		expect(optionScore('created', 'cat', ['Opened'])).toBe(0);
	});

	it('finds an option by its query word too', () => {
		expect(optionScore('from', 'from', ['Latest activity by'])).toBe(1);
	});
});
