import { describe, expect, it } from 'vitest';
import { ABOUT } from '$lib/about';
import { COMPARE, COMPARE_INDEX } from '$lib/compare/content';
import { DOCS } from '$lib/docs';
import { GUIDES, GUIDES_INDEX } from '$lib/guides/content';
import { SEARCH_SNIPPET_LENGTH } from './site';

const PAGES = [...DOCS, ...ABOUT, ...COMPARE, COMPARE_INDEX, ...GUIDES, GUIDES_INDEX];

describe('site page descriptions', () => {
	it('fit in a search result snippet', () => {
		for (const page of PAGES)
			expect(page.description.length, page.slug || page.title).toBeLessThanOrEqual(
				SEARCH_SNIPPET_LENGTH
			);
	});
});
