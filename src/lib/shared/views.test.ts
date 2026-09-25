import { describe, expect, it } from 'vitest';
import type { SavedView, ThreadDTO } from './types';
import { textMatches, validateViews, viewMatches } from './views';
import { validateRules } from './classify';

const t = (over: Partial<ThreadDTO> = {}): ThreadDTO =>
	({
		id: '1',
		repo: 'PostHog/posthog.com',
		subjectType: 'CheckSuite',
		title: 'HogFM workflow run failed for master branch',
		reason: 'ci_activity',
		unread: false,
		updatedAt: '2026-09-20T00:00:00Z',
		htmlUrl: 'https://github.com/PostHog/posthog.com/actions',
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
	when: {},
	...over
});

describe('saved views', () => {
	it('match on text, like the Filter box', () => {
		expect(textMatches(t(), 'hogfm')).toBe(true);
		expect(viewMatches(view({ query: 'nope' }), t(), 'ian')).toBe(false);
	});

	it('match on the same conditions as rules', () => {
		expect(viewMatches(view({ when: { repo: 'PostHog/*' } }), t(), 'ian')).toBe(true);
		expect(viewMatches(view({ when: { repo: 'other/*' } }), t(), 'ian')).toBe(false);
		expect(viewMatches(view({ when: { type: ['PullRequest'] } }), t(), 'ian')).toBe(false);
		expect(viewMatches(view({ when: { kind: ['fix_ci'] } }), t(), 'ian')).toBe(true);
		expect(viewMatches(view({ when: { label: ['docs'] } }), t({ labels: ['docs'] }), 'ian')).toBe(
			true
		);
		expect(viewMatches(view({ when: { bot: true } }), t({ authorIsBot: true }), 'ian')).toBe(true);
	});

	it('refuses bad views', () => {
		const when = (w: unknown) => validateRules([{ when: w, then: { category: 'fyi' } }] as never);
		expect(validateViews([view()], when)).toBeNull();
		expect(validateViews([view({ name: ' ' })], when)).toMatch(/name/);
		expect(validateViews([view({ base: 'muted' as never })], when)).toMatch(/base/);
		expect(validateViews([view(), view()], when)).toMatch(/same id/);
		expect(validateViews([view({ when: { repo: [] } })], when)).toMatch(/value/);
	});
});
