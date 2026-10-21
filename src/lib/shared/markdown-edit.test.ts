import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { markdownLink, moveTextRange, textChange } from './markdown-edit';

describe('markdownLink', () => {
	it('turns selected text into a link without changing the URL', () => {
		expect(markdownLink('the docs', ' https://example.com/docs?q=a&b=c ')).toBe(
			'[the docs](https://example.com/docs?q=a&b=c)'
		);
	});
	it.each(['', 'words', 'https://', 'https://one.test https://two.test', 'javascript:alert(1)'])(
		'leaves ordinary paste in place for %j',
		(pasted) => expect(markdownLink('label', pasted)).toBeNull()
	);
	it('leaves paste unchanged without selected text', () => {
		expect(markdownLink('', 'https://example.com')).toBeNull();
		expect(markdownLink(' \n ', 'https://example.com')).toBeNull();
	});
	it('escapes link delimiters so labels and destinations render correctly', () => {
		const markdown = markdownLink('docs [v2] \\ guide', 'https://example.com/a(b)<c>')!;
		expect(marked.parseInline(markdown)).toBe(
			'<a href="https://example.com/a%28b%29%3Cc%3E">docs [v2] \\ guide</a>'
		);
	});
});

describe('textChange', () => {
	it.each([
		['abc', 'abXc'],
		['abc', 'ac'],
		['before old after', 'before new after'],
		['', 'image'],
		['unchanged', 'unchanged'],
		['image', '']
	])('reconstructs %j as %j with a single edit', (before, after) => {
		const { start, end, replacement } = textChange(before, after);
		expect(before.slice(0, start) + replacement + before.slice(end)).toBe(after);
	});
});

describe('moveTextRange', () => {
	it('tracks edits before an upload position', () => {
		expect(moveTextRange({ start: 4, end: 7 }, textChange('abc def', 'abcX def'))).toEqual({
			start: 5,
			end: 8
		});
	});
	it('keeps the position when edits occur after it', () => {
		expect(moveTextRange({ start: 2, end: 2 }, textChange('abc', 'abc def'))).toEqual({
			start: 2,
			end: 2
		});
	});
	it('keeps text typed at the upload position before the image', () => {
		expect(moveTextRange({ start: 3, end: 3 }, textChange('abc', 'abc def'))).toEqual({
			start: 7,
			end: 7
		});
	});
	it('does not replace new text that overlaps the original selection', () => {
		expect(moveTextRange({ start: 2, end: 5 }, textChange('a old z', 'a new z'))).toEqual({
			start: 5,
			end: 5
		});
	});
});
