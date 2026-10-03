import { describe, expect, it } from 'vitest';
import { faqData, htmlToPlainText } from './structured-data';

describe('htmlToPlainText', () => {
	it('drops tags and keeps their text', () => {
		expect(
			htmlToPlainText('Use <code>gh auth token</code>. See <a href="/docs">the docs</a>.')
		).toBe('Use gh auth token. See the docs.');
	});

	it('decodes the common entities and collapses whitespace', () => {
		expect(htmlToPlainText('A &amp; B\n\t &lt;tag&gt;')).toBe('A & B <tag>');
	});
});

describe('faqData', () => {
	it('builds an FAQPage with one plain-text answer for each question', () => {
		const data = faqData([
			{ question: 'Is it free?', answerHtml: 'Yes. See <a href="/pricing">pricing</a>.' }
		]);
		expect(data).toEqual({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: [
				{
					'@type': 'Question',
					name: 'Is it free?',
					acceptedAnswer: { '@type': 'Answer', text: 'Yes. See pricing.' }
				}
			]
		});
	});
});
