import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import { DEFAULT_SETTINGS } from './settings';
import type { Enrichment, Reason } from './types';
import { REOPEN_WINDOW_MS, watchOutcome, type Watched } from './watch';

const ME = 'ian';
const NOW = Date.parse('2026-09-20T12:00:00Z');

const pr = (e: Partial<Enrichment> = {}): Enrichment => ({
	kind: 'pr',
	number: 1,
	url: 'https://github.com/o/r/pull/1',
	state: 'open',
	author: 'alice',
	ci: 'SUCCESS',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	lastCommitAt: '2026-09-10T00:00:00Z',
	...e
});

/** Classify `before`, store it as `triage`, then look again with `after`. */
function step(
	before: Enrichment,
	after: Enrichment,
	triage = 'inbox',
	reason: Reason = 'review_requested',
	extra: Partial<Watched> = {}
) {
	const facts = (e: Enrichment) => ({
		repo: 'o/r',
		subjectType: 'PullRequest',
		title: 't',
		reason,
		htmlUrl: e.url!,
		enrichment: e,
		me: ME
	});
	const old = classify(facts(before), DEFAULT_SETTINGS);
	const next = classify(facts(after), DEFAULT_SETTINGS);
	const w: Watched = {
		category: old.category,
		kind: old.kind,
		triage,
		enrichment: before,
		resolvedAt: null,
		snoozeEvent: null,
		snoozedAt: null,
		...extra
	};
	return { old, next, out: watchOutcome(w, next, after, ME, NOW) };
}

describe('the inbox watcher', () => {
	it('moves a review request to Done after you approve', () => {
		const { old, out } = step(
			pr({ reviewRequestedFromMe: true }),
			pr({
				reviewRequestedFromMe: false,
				myReview: { at: '2026-09-20T11:00:00Z', state: 'APPROVED' }
			})
		);
		expect(old.category).toBe('action');
		expect(out).toMatchObject({ triage: 'done', resolvedNote: 'You approved', resolvedAt: NOW });
	});

	it('moves "fix CI" to Done when CI passes', () => {
		const { out } = step(
			pr({ author: ME, ci: 'FAILURE' }),
			pr({ author: ME, ci: 'SUCCESS' }),
			'inbox',
			'author'
		);
		expect(out).toMatchObject({ triage: 'done', resolvedNote: 'CI passes now' });
	});

	it('moves "reply" to Done after you reply', () => {
		const c = (by: string) => ({
			author: by,
			authorIsBot: false,
			body: '',
			url: 'u',
			createdAt: '2026-09-20T00:00:00Z'
		});
		const { out } = step(
			pr({ author: ME, lastComment: c('bob') }),
			pr({ author: ME, lastComment: c(ME) }),
			'inbox',
			'comment'
		);
		expect(out).toMatchObject({ triage: 'done', resolvedNote: 'You replied' });
	});

	it('moves an action to Done when the PR is merged', () => {
		const { out } = step(pr({ reviewRequestedFromMe: true }), pr({ state: 'merged' }));
		expect(out).toMatchObject({ triage: 'done', resolvedNote: 'Merged' });
	});

	it('moves an FYI to Done when its PR closes, but not the close notification itself', () => {
		const later = step(pr(), pr({ state: 'closed' }), 'inbox', 'subscribed');
		expect(later.out).toMatchObject({ triage: 'done', resolvedNote: 'Closed' });
		const itself = step(pr({ state: 'closed' }), pr({ state: 'closed' }), 'inbox', 'state_change');
		expect(itself.out.triage).toBe('inbox');
	});

	it('brings an auto-resolved thread back when it needs you again', () => {
		const { out } = step(
			pr({ author: ME, ci: 'SUCCESS' }),
			pr({ author: ME, ci: 'FAILURE' }),
			'done',
			'author',
			{ category: 'fyi', kind: 'none', resolvedAt: NOW - 60_000 }
		);
		expect(out).toMatchObject({ triage: 'inbox', resolvedAt: null, push: 'CI failed on your PR' });
	});

	it('leaves Done alone when you marked it yourself, or long ago', () => {
		const back = (resolvedAt: number | null) =>
			step(pr({ author: ME }), pr({ author: ME, ci: 'FAILURE' }), 'done', 'author', {
				category: 'fyi',
				kind: 'none',
				resolvedAt
			}).out.triage;
		expect(back(null)).toBe('done');
		expect(back(NOW - REOPEN_WINDOW_MS - 1)).toBe('done');
	});

	it('pushes when an FYI becomes your turn', () => {
		const { out } = step(
			pr({ myReview: { at: '2026-09-11T00:00:00Z', state: 'APPROVED' } }),
			pr({
				myReview: { at: '2026-09-11T00:00:00Z', state: 'APPROVED' },
				lastCommitAt: '2026-09-19T00:00:00Z'
			}),
			'inbox',
			'subscribed'
		);
		expect(out).toMatchObject({ triage: 'inbox', push: 'New commits since your review' });
	});

	it('names a rule, not a change, when nothing changed', () => {
		// Your draft PR with conflicts was "Needs you" under the old rules; drafts are never your turn.
		const { out } = step(
			pr({ author: ME, draft: true, mergeable: 'CONFLICTING' }),
			pr({ author: ME, draft: true, mergeable: 'CONFLICTING' }),
			'inbox',
			'author',
			{ category: 'action', kind: 'resolve_conflict' }
		);
		expect(out).toMatchObject({ triage: 'done', resolvedNote: 'Draft PR' });
	});

	it('leaves an unchanged action alone', () => {
		const e = pr({ reviewRequestedFromMe: true });
		expect(step(e, e).out).toMatchObject({ triage: 'inbox', push: null });
	});

	it('wakes a conditional snooze', () => {
		const { out } = step(
			pr({ author: ME, ci: 'PENDING' }),
			pr({ author: ME, ci: 'SUCCESS' }),
			'snoozed',
			'author',
			{
				snoozeEvent: 'ci_pass',
				snoozedAt: NOW - 60_000
			}
		);
		expect(out).toMatchObject({
			triage: 'inbox',
			clearSnooze: true,
			push: 'Snooze over: CI passed'
		});
	});
});
