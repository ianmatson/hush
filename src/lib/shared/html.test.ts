import { describe, expect, it } from 'vitest';
import { escapeHtml, htmlToPlainText } from './html';

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

describe('htmlToPlainText', () => {
	it('drops tags and keeps their text', () => {
		expect(
			htmlToPlainText('Use <code>gh auth token</code>. See <a href="/docs">the docs</a>.')
		).toBe('Use gh auth token. See the docs.');
	});

	it('decodes the common entities and collapses whitespace', () => {
		expect(htmlToPlainText('A &amp; B\n\t &lt;tag&gt;&nbsp;it&#39;s')).toBe("A & B <tag> it's");
	});
});
