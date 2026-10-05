import { describe, expect, it } from 'vitest';
import type { SavedView, ThreadDTO } from './types';
import {
	feedViewOk,
	markFeedView,
	parseMarkFeed,
	threadMatches,
	validateViews,
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

const view = (over: Partial<SavedView> = {}): SavedView => ({
	id: 'v1',
	name: 'CI',
	base: 'inbox',
	query: '',
	...over
});

describe('notification views', () => {
	it('match on the category and tags of the thread’s PR or issue', () => {
		const marks: MarkNames = {
			categories: [{ id: 'bugs', name: 'Bugs', color: 'red', rule: '', description: '' }],
			tags: [{ id: 'quick', name: 'Quick', color: 'green', rule: '' }]
		};
		const bug = t({ itemCategory: 'bugs', tags: ['quick'] });
		expect(threadMatches('category:Bugs', bug, 'ian', marks)).toBe(true);
		expect(threadMatches('category:bugs tag:quick', bug, 'ian', marks)).toBe(true);
		expect(threadMatches('tag:Quick', t({ itemCategory: 'bugs', tags: [] }), 'ian', marks)).toBe(
			false
		);
		expect(threadMatches('-category:bugs', t({ itemCategory: null }), 'ian', marks)).toBe(true);
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

	it('refuses bad views', () => {
		expect(validateViews([view()])).toBeNull();
		expect(validateViews([view({ name: ' ' })])).toMatch(/name/);
		expect(validateViews([view({ base: 'muted' as never })])).toMatch(/base/);
		expect(validateViews([view(), view()])).toMatch(/same id/);
		expect(validateViews([view({ query: 'nope:1' })])).toMatch(/nope/);
		expect(validateViews([view({ query: { repo: 'x' } as never })])).toMatch(/must be a query/);
	});
});

describe('feeds', () => {
	it('exist for tabs, saved views, categories, and tags', () => {
		expect(feedViewOk('action')).toBe(true);
		expect(feedViewOk('v:abc')).toBe(true);
		expect(markFeedView('category', 'bugs')).toBe('c:bugs');
		expect(parseMarkFeed(markFeedView('tag', 'needs-decision'))).toEqual({
			subject: 'tag',
			id: 'needs-decision'
		});
		expect(feedViewOk('c:bugs')).toBe(true);
		expect(feedViewOk('x:bugs')).toBe(false);
	});

	it('allow category: and tag: in notification views', () => {
		const view = { id: 'a', name: 'A', base: 'inbox', query: 'tag:blocked' } as SavedView;
		expect(validateViews([view])).toBeNull();
	});
});
