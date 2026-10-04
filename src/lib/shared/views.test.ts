import { describe, expect, it } from 'vitest';
import { feedViewOf, feedViewOk, parseFeedView } from './views';

describe('feed views', () => {
	it('names a category or a tag', () => {
		expect(feedViewOf('category', 'bugs')).toBe('c:bugs');
		expect(feedViewOf('tag', 'blocked')).toBe('t:blocked');
		expect(parseFeedView('c:bugs')).toEqual({ subject: 'category', id: 'bugs' });
		expect(parseFeedView('t:needs-decision')).toEqual({ subject: 'tag', id: 'needs-decision' });
	});
	it('refuses the old inbox tabs and anything else', () => {
		for (const view of ['action', 'fyi', 'inbox', 'v:abc', 'c:', 'x:bugs', 'c:Bugs'])
			expect(feedViewOk(view)).toBe(false);
	});
});
