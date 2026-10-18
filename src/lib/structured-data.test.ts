import { describe, expect, it } from 'vitest';
import { faqData } from './structured-data';

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
