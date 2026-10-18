import { describe, expect, it } from 'vitest';
import { FAQ } from '$lib/components/site/landing/landing-content';
import { brokenLinks } from '$lib/site-links';
import { SITE_PAGES } from '$lib/site-pages';
import { SEARCH_SNIPPET_LENGTH } from './site';

const LANDING_PAGE_SOURCE = Object.values(
	import.meta.glob('/src/routes/(site)/+page.svelte', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>
)[0];

describe('site page descriptions', () => {
	it('fit in a search result snippet', () => {
		for (const page of SITE_PAGES)
			expect(page.description.length, page.path).toBeLessThanOrEqual(SEARCH_SNIPPET_LENGTH);
	});
});

describe('brokenLinks', () => {
	it('finds links to missing pages and sections, and skips pages, files, and other sites', () => {
		const html = [
			'<a href="/docs/no-such-page">',
			'<a href="/docs/notifications#no-such-section">',
			'<a href="/docs/notifications#what-gets-pushed">',
			'<a href="/compare/index.md">',
			'<a href="/llms.txt">',
			'<a href="https://github.com">'
		].join('');
		expect(brokenLinks('/', html)).toEqual([
			'/docs/no-such-page',
			'/docs/notifications#no-such-section'
		]);
	});
});

describe('the landing page', () => {
	it('links only to pages and sections that exist', () => {
		expect(LANDING_PAGE_SOURCE).toContain('href="/docs/notifications#what-gets-pushed"');
		const html = [LANDING_PAGE_SOURCE, ...FAQ.map((item) => item.answerHtml)].join('\n');
		expect(brokenLinks('/', html)).toEqual([]);
	});
});
