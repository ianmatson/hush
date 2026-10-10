import { describe, expect, it } from 'vitest';
import {
	categoryFeedView,
	feedViewOk,
	parseCategoryFeed,
	parseViewFeed,
	viewFeedView
} from './views';

describe('feeds', () => {
	it('exist for views and categories only', () => {
		expect(feedViewOk('action')).toBe(false);
		expect(viewFeedView('posthog-com')).toBe('v:posthog-com');
		expect(parseViewFeed('v:posthog-com')).toBe('posthog-com');
		expect(feedViewOk('v:posthog-com')).toBe(true);
		expect(categoryFeedView('needs-decision')).toBe('c:needs-decision');
		expect(parseCategoryFeed('c:needs-decision')).toBe('needs-decision');
		expect(feedViewOk('c:bugs')).toBe(true);
		expect(feedViewOk('t:bugs')).toBe(false);
	});
});
