import { describe, expect, it } from 'vitest';
import type { ThreadDTO } from './types';
import {
	categoryFeedView,
	feedViewOk,
	parseCategoryFeed,
	parseViewFeed,
	threadMatches,
	viewFeedView,
	type MarkNames
} from './views';

const t = (over: Partial<ThreadDTO> = {}): ThreadDTO =>
	({
		id: '1',
		repo: 'acme/website',
		subjectType: 'CheckSuite',
		title: 'HogFM workflow run failed for master branch',
		reason: 'ci_activity',
		unread: false,
		updatedAt: '2026-09-20T00:00:00Z',
		htmlUrl: 'https://github.com/acme/website/actions',
		category: 'action',
		kind: 'fix_ci',
		summary: 'A workflow run failed',
		why: 'Your workflow run',
		actionLabel: 'View run',
		actionUrl: 'u',
		triage: 'inbox',
		snoozedUntil: null,
		snoozeEvent: null,
		resolvedNote: null,
		number: null,
		state: null,
		draft: false,
		ci: null,
		author: null,
		authorIsBot: false,
		labels: [],
		rule: null,
		...over
	}) as ThreadDTO;

describe('threadMatches', () => {
	it('match on the categories of the thread’s PR or issue', () => {
		const marks: MarkNames = {
			categoryGroups: [
				{
					id: 'area',
					name: 'Area',
					categories: [{ id: 'bugs', name: 'Bugs', color: 'red', rule: '', description: '' }]
				},
				{
					id: 'size',
					name: 'Size',
					categories: [{ id: 'quick', name: 'Quick', color: 'green', rule: '', description: '' }]
				}
			]
		};
		const bug = t({ categories: ['bugs', 'quick'] });
		expect(threadMatches('category:Bugs', bug, 'ian', marks)).toBe(true);
		expect(threadMatches('category:bugs category:quick', bug, 'ian', marks)).toBe(true);
		expect(threadMatches('category:Quick', t({ categories: ['bugs'] }), 'ian', marks)).toBe(false);
		expect(threadMatches('-category:bugs', t({ categories: [] }), 'ian', marks)).toBe(true);
	});

	it('match on text, like the Filter box', () => {
		expect(threadMatches({ text: 'hogfm' }, t(), 'ian')).toBe(true);
		expect(threadMatches({ text: 'failed website' }, t(), 'ian')).toBe(true);
		expect(threadMatches({ text: 'nope' }, t(), 'ian')).toBe(false);
		expect(threadMatches({ state: ['open'] }, t({ state: 'open' }), 'ian')).toBe(true);
	});

	it('match a stored query', () => {
		expect(threadMatches('repo:acme/* needs:fix-ci', t(), 'ian')).toBe(true);
		expect(threadMatches('type:pr', t(), 'ian')).toBe(false);
		expect(threadMatches('', t(), 'ian')).toBe(true);
	});

	it('match on the same conditions as rules', () => {
		expect(threadMatches({ repo: 'acme/*' }, t(), 'ian')).toBe(true);
		expect(threadMatches({ repo: 'other/*' }, t(), 'ian')).toBe(false);
		expect(threadMatches({ type: ['PullRequest'] }, t(), 'ian')).toBe(false);
		expect(threadMatches({ kind: ['fix_ci'] }, t(), 'ian')).toBe(true);
		expect(threadMatches({ label: ['docs'] }, t({ labels: ['docs'] }), 'ian')).toBe(true);
		expect(threadMatches({ bot: true }, t({ authorIsBot: true }), 'ian')).toBe(true);
	});
});

describe('feeds', () => {
	it('exist for inbox tabs, views, and categories', () => {
		expect(feedViewOk('action')).toBe(true);
		expect(viewFeedView('posthog-com')).toBe('v:posthog-com');
		expect(parseViewFeed('v:posthog-com')).toBe('posthog-com');
		expect(feedViewOk('v:posthog-com')).toBe(true);
		expect(categoryFeedView('needs-decision')).toBe('c:needs-decision');
		expect(parseCategoryFeed('c:needs-decision')).toBe('needs-decision');
		expect(feedViewOk('c:bugs')).toBe(true);
		expect(feedViewOk('t:bugs')).toBe(false);
	});
});
