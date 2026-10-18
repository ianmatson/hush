import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
	it('escapes text for element content and double-quoted attributes', () => {
		expect(escapeHtml(`<a href="x?a=1&b=2">it's</a>`)).toBe(
			`&lt;a href=&quot;x?a=1&amp;b=2&quot;&gt;it's&lt;/a&gt;`
		);
	});

	it('escapes an ampersand once', () => {
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});
});
