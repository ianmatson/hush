import { describe, expect, it } from 'vitest';
import { nextItemState, type ItemBefore } from './lifecycle';
import { place } from './place';
import { DEFAULT_SETTINGS } from './settings';
import { enrichmentOf, type SubjectFacts } from './subject';
import type { Reason } from './types';

const ME = 'ian';
const NOW = Date.parse('2026-09-20T12:00:00Z');

const subject = (over: Partial<SubjectFacts> = {}): SubjectFacts => ({
	id: 'x',
	kind: 'pr',
	repo: 'o/r',
	number: 1,
	title: 't',
	url: 'https://github.com/o/r/pull/1',
	author: 'alice',
	authorAvatar: null,
	authorIsBot: false,
	createdAt: '2026-09-01T00:00:00Z',
	updatedAt: '2026-09-10T00:00:00Z',
	state: 'open',
	draft: false,
	labels: [],
	assignees: [],
	comments: 0,
	commits: 1,
	lastComment: null,
	ci: 'SUCCESS',
	reviewDecision: 'REVIEW_REQUIRED',
	mergeable: 'MERGEABLE',
	additions: 1,
	deletions: 1,
	lastCommitAt: '2026-09-02T00:00:00Z',
	reviewRequests: [],
	requestEvents: [],
	myReview: null,
	latestReview: null,
	verdicts: [],
	openThreads: 0,
	...over
});

/** Place an item as `before`, store it with `prev`, then place it again as `after`. */
function step(
	before: SubjectFacts,
	after: SubjectFacts,
	prev: Partial<ItemBefore> = {},
	reason: Reason = 'review_requested',
	ctx: { quiet?: boolean; userAction?: boolean } = {}
) {
	const placeOf = (s: SubjectFacts) =>
		place(
			{
				repo: 'o/r',
				subjectType: 'PullRequest',
				title: 't',
				reason,
				htmlUrl: s.url,
				enrichment: enrichmentOf(s, ME),
				subject: s,
				me: ME
			},
			DEFAULT_SETTINGS
		);
	const old = placeOf(before);
	const next = placeOf(after);
	const sigOf = (p: typeof old, s: SubjectFacts) => `${p.reason}|${s.updatedAt}`;
	const stored: ItemBefore = {
		lane: old.lane,
		state: 'active',
		needs: old.needs,
		doneSig: null,
		override: null,
		overrideSig: null,
		snoozedUntil: null,
		snoozeEvent: null,
		snoozedAt: null,
		finishedAt: null,
		finishedNote: null,
		pushedSig: sigOf(old, before),
		...prev
	};
	const out = nextItemState(stored, next, {
		sig: sigOf(next, after),
		now: NOW,
		me: ME,
		subject: after,
		before,
		settings: DEFAULT_SETTINGS,
		...ctx
	});
	return { old, next, out, oldSig: sigOf(old, before) };
}

const requested = { reviewRequests: [{ team: false, name: ME }] };

describe('item life', () => {
	it('an approved review request leaves Your turn, and says "You approved"', () => {
		const { old, out } = step(
			subject(requested),
			subject({
				updatedAt: '2026-09-11T00:00:00Z',
				myReview: { at: '2026-09-11T00:00:00Z', state: 'APPROVED' }
			})
		);
		expect(old.lane).toBe('turn');
		expect(out).toMatchObject({ lane: 'waiting', finished: 'You approved', push: false });
	});

	it('"fix CI" leaves Your turn when CI passes', () => {
		const { out } = step(
			subject({ author: ME, ci: 'FAILURE' }),
			subject({ author: ME, ci: 'SUCCESS', updatedAt: '2026-09-11T00:00:00Z' }),
			{},
			'author'
		);
		expect(out.finished).toBe('CI passes now');
	});

	it('an item that comes into Your turn is pushed, once', () => {
		const before = subject({ author: ME });
		const after = subject({ author: ME, ci: 'FAILURE', updatedAt: '2026-09-11T00:00:00Z' });
		const { out } = step(before, after, {}, 'author');
		expect(out).toMatchObject({ lane: 'turn', push: true });
		expect(step(before, after, { pushedSig: out.pushedSig }, 'author').out.push).toBe(false);
		expect(step(before, after, {}, 'author', { quiet: true }).out.push).toBe(false);
	});

	it('Done lasts until the turn changes', () => {
		const s = subject(requested);
		const { out, oldSig } = step(s, s, { state: 'done', doneSig: null });
		// Same signature as when you chose Done: it stays done.
		expect(step(s, s, { state: 'done', doneSig: oldSig }).out.state).toBe('done');
		// A new push to the PR: its turn changed, it is back.
		const pushed = subject({ ...requested, updatedAt: '2026-09-12T00:00:00Z' });
		expect(step(s, pushed, { state: 'done', doneSig: oldSig }).out.state).toBe('active');
		expect(out.state).toBe('active');
	});

	it('Done stays when the change only lands in Updates', () => {
		const s = subject(requested);
		const merged = subject({ state: 'merged', updatedAt: '2026-09-12T00:00:00Z' });
		const { oldSig } = step(s, s);
		expect(step(s, merged, { state: 'done', doneSig: oldSig }).out.state).toBe('done');
	});

	it('your override lasts until the item changes', () => {
		const s = subject(requested);
		const { oldSig } = step(s, s);
		expect(step(s, s, { override: 'updates', overrideSig: oldSig }).out.lane).toBe('updates');
		const changed = subject({ ...requested, updatedAt: '2026-09-12T00:00:00Z' });
		expect(step(s, changed, { override: 'updates', overrideSig: oldSig }).out).toMatchObject({
			lane: 'turn',
			override: null
		});
	});

	it('ends a snooze when its condition happens', () => {
		const { out } = step(
			subject({ author: ME, ci: 'PENDING' }),
			subject({ author: ME, ci: 'SUCCESS', updatedAt: '2026-09-11T00:00:00Z' }),
			{
				state: 'snoozed',
				snoozeEvent: 'ci_pass',
				snoozedAt: NOW - 60_000,
				snoozedUntil: NOW + 1e9
			},
			'author'
		);
		expect(out).toMatchObject({ state: 'active', snoozeEvent: null, woke: 'CI passed' });
	});

	it('writes no "finished" note for a change you made (settings)', () => {
		const { out } = step(
			subject(requested),
			subject({
				updatedAt: '2026-09-11T00:00:00Z',
				myReview: { at: '2026-09-11T00:00:00Z', state: 'APPROVED' }
			}),
			{},
			'review_requested',
			{ userAction: true }
		);
		expect(out.finished).toBeNull();
	});
});
