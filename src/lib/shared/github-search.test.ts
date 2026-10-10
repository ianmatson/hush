import { describe, expect, it } from 'vitest';
import { describeSearch, formatSearch, parseSearch } from './github-search';
import { DEFAULT_VIEWS } from './item-views';

describe('GitHub search builder', () => {
	it.each(DEFAULT_VIEWS.flatMap((v) => v.searches))('keeps %s as it is', (query) => {
		expect(formatSearch(parseSearch(query))).toBe(query);
	});

	it('keeps parts it does not know as GitHub syntax', () => {
		const parts = parseSearch('is:open archived:false sort:updated');
		expect(parts.map((p) => p.key)).toEqual(['is-state', 'raw', 'raw']);
		expect(formatSearch(parts)).toBe('is:open archived:false sort:updated');
	});

	it('reads negation and quoted values', () => {
		expect(parseSearch('-author:@me label:"good first issue"')).toEqual([
			{ key: 'author', negate: true, value: '@me' },
			{ key: 'label', negate: false, value: 'good first issue' }
		]);
		expect(formatSearch(parseSearch('label:"good first issue"'))).toBe('label:"good first issue"');
	});

	it('says what a source finds in plain words', () => {
		expect(describeSearch(parseSearch('is:pr is:open user-review-requested:@me'))).toBe(
			'Type is pull request, state is open, and review requested from person @me.'
		);
		expect(describeSearch(parseSearch('reviewed-by:@me -author:@me'))).toBe(
			'Reviewed by @me, and author is not @me.'
		);
		expect(describeSearch(parseSearch('repo:Acme/Web'))).toBe('Repository is Acme/Web.');
	});
});
