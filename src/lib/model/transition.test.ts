import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../shared/durations';
import { transitionView, interestOf } from './transition';
import { NOW, answeredEffort, facts, item, view, world, type World } from './testing';
import type { ViewState } from './types';

function step(
	w: World,
	previous: ViewState | null,
	cause: 'observation' | 'command' = 'observation',
	closedNow: string[] = []
) {
	const built = world(w);
	const compiled = built.compiled.views[0];
	const found = built.evaluator.membership(compiled);
	const context = {
		...built.evaluation,
		closedNow: new Set(closedNow),
		freshSources: new Set<string>()
	};
	const transition = transitionView(compiled, previous, found, context, cause);
	return { ...transition, found, built };
}

const open = ['is:pr is:open repo:PostHog/posthog'];

describe('new in view', () => {
	it('seeds the first result of a search quietly, then admits later arrivals', () => {
		const a = facts(1);
		const b = facts(2);
		const first = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			null
		);
		expect(first.admitted).toEqual([]);
		const second = step(
			{ views: [view('v', open)], items: [item(a), item(b)], results: { 0: [a.id, b.id] } },
			first.state
		);
		expect(second.admitted).toEqual([b.id]);
	});

	it('keeps candidates quiet while their details load after the first result', () => {
		const a = facts(1);
		const first = step({ views: [view('v', open)], items: [], results: { 0: [a.id] } }, null);
		expect(first.state.baseline).toEqual([a.id]);
		const hydrated = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			first.state
		);
		expect(hydrated.admitted).toEqual([]);
		expect(hydrated.state.baseline).toEqual([]);
	});

	it('keeps candidates quiet while their first AI answer is pending', () => {
		const a = facts(1);
		const lowEffort = [view('v', ['is:pr is:open category:effort/low'])];
		const first = step({ views: lowEffort, items: [item(a)], results: { 0: [a.id] } }, null);
		expect(first.state.baseline).toEqual([a.id]);
		const answered = step(
			{
				views: lowEffort,
				items: [item(a, { analysis: answeredEffort(a, 'low') })],
				results: { 0: [a.id] }
			},
			first.state
		);
		expect(answered.state.members).toEqual([a.id]);
		expect(answered.admitted).toEqual([]);
	});

	it('does not count a member as new while its category answer refreshes', () => {
		const a = facts(1);
		const lowEffort = [view('v', ['is:pr is:open category:effort/low'])];
		const settled = step(
			{
				views: lowEffort,
				items: [item(a, { analysis: answeredEffort(a, 'low') })],
				results: { 0: [a.id] }
			},
			null
		);
		const refreshing = step(
			{
				views: lowEffort,
				items: [item(a, { analysis: answeredEffort(a, 'low', true) })],
				results: { 0: [a.id] }
			},
			settled.state
		);
		expect(refreshing.state.members).toEqual([a.id]);
		expect(refreshing.departed).toEqual([]);
		expect(refreshing.admitted).toEqual([]);
	});

	it('counts re-entry as new', () => {
		const a = facts(1);
		const w = (results: string[]) => ({
			views: [view('v', open)],
			items: [item(a)],
			results: { 0: results }
		});
		const seeded = step(w([a.id]), null);
		const left = step(w([]), seeded.state);
		expect(left.departed).toEqual([a.id]);
		expect(step(w([a.id]), left.state).admitted).toEqual([a.id]);
	});

	it('never admits from a local command such as a pin or a settings edit', () => {
		const a = facts(1);
		const seeded = step({ views: [view('v', open)], items: [], results: { 0: [] } }, null);
		const pinned = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			seeded.state,
			'command'
		);
		expect(pinned.admitted).toEqual([]);
		expect(pinned.state.members).toEqual([a.id]);
	});

	it('starts a changed view quietly, and drops its old retention', () => {
		const a = facts(1);
		const b = facts(2, { state: 'merged', closedAt: new Date(NOW - HOUR_MS).toISOString() });
		const before: ViewState = {
			scope: 'old',
			members: [],
			retained: [b.id],
			seededBindings: ['x'],
			baseline: [],
			awaitingRefresh: []
		};
		const changed = step(
			{ views: [view('v', open)], items: [item(a), item(b)], results: { 0: [a.id] } },
			before
		);
		expect(changed.admitted).toEqual([]);
		expect(changed.state.retained).toEqual([]);
	});

	it('seeds a new view quietly from a search another view already ran', () => {
		const a = facts(1);
		const shared = { views: [view('new', open)], items: [item(a)], results: { 0: [a.id] } };
		expect(step(shared, null).admitted).toEqual([]);
	});

	it('reseeds quietly when a failed search recovers after its stale hour', () => {
		const a = facts(1);
		const b = facts(2);
		const seeded = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			null
		);
		const expired = step(
			{
				views: [view('v', open)],
				items: [item(a)],
				results: { 0: [a.id] },
				sources: () => ({ failedSince: NOW - 2 * HOUR_MS, error: 'timeout' })
			},
			seeded.state
		);
		expect(expired.state.seededBindings).toEqual([]);
		const recovered = step(
			{ views: [view('v', open)], items: [item(a), item(b)], results: { 0: [a.id, b.id] } },
			expired.state
		);
		expect(recovered.admitted).toEqual([]);
	});

	it('keeps new-in-view across @today rollover', () => {
		const a = facts(1);
		const b = facts(2);
		const recent = [view('v', ['is:pr is:open updated:>@today-7d'])];
		const today = step({ views: recent, items: [item(a)], results: { 0: [a.id] } }, null);
		const tomorrow = step(
			{ views: recent, items: [item(a), item(b)], results: { 0: [a.id, b.id] }, now: NOW + DAY_MS },
			today.state
		);
		expect(tomorrow.admitted).toEqual([b.id]);
	});
});

describe('closed items', () => {
	const merged = (minutesAgo: number) =>
		facts(1, { state: 'merged', closedAt: new Date(NOW - minutesAgo * MINUTE_MS).toISOString() });

	it('keeps a member that closed for 24 hours, then lets it go', () => {
		const a = facts(1);
		const member = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			null
		);
		const closed = step(
			{ views: [view('v', open)], items: [item(merged(5))], results: { 0: [a.id] } },
			member.state,
			'observation',
			[a.id]
		);
		expect(closed.state).toMatchObject({ members: [], retained: [a.id] });
		expect(closed.departed).toEqual([a.id]);
		const rows = closed.built.evaluator.evaluate(closed.built.compiled.views[0], closed.state).rows;
		expect(rows).toMatchObject([{ itemId: a.id, retained: true }]);
		const later = step(
			{ views: [view('v', open)], items: [item(merged(5))], results: { 0: [] }, now: NOW + DAY_MS },
			closed.state
		);
		expect(later.state.retained).toEqual([]);
	});

	it('does not keep closed items when the view turns that off', () => {
		const a = facts(1);
		const noKeep = [view('v', open, { keepClosed: false })];
		const member = step({ views: noKeep, items: [item(a)], results: { 0: [a.id] } }, null);
		const closed = step(
			{ views: noKeep, items: [item(merged(5))], results: { 0: [] } },
			member.state,
			'observation',
			[a.id]
		);
		expect(closed.state.retained).toEqual([]);
	});

	it('ends retention when the item reopens', () => {
		const a = facts(1);
		const retained: ViewState = {
			...step({ views: [view('v', open)], items: [], results: { 0: [] } }, null).state,
			retained: [a.id]
		};
		const reopened = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [] } },
			retained
		);
		expect(reopened.state.retained).toEqual([]);
	});

	it('does not keep an item that Hush never saw open when it leaves a merged-item search', () => {
		const done = merged(5);
		const mergedSearch = [view('v', ['is:pr is:merged repo:PostHog/posthog'])];
		const found = step(
			{ views: mergedSearch, items: [item(done)], results: { 0: [done.id] } },
			null
		);
		const left = step(
			{ views: mergedSearch, items: [item(done)], results: { 0: [] } },
			found.state
		);
		expect(left.state.retained).toEqual([]);
	});

	it('keeps retention while the item is also an ordinary member, and shows it once', () => {
		const a = facts(1);
		const both = [
			view('v', ['is:pr is:open repo:PostHog/posthog', 'is:pr is:merged repo:PostHog/posthog'])
		];
		const member = step({ views: both, items: [item(a)], results: { 0: [a.id], 1: [] } }, null);
		const closed = step(
			{ views: both, items: [item(merged(5))], results: { 0: [], 1: [a.id] } },
			member.state,
			'observation',
			[a.id]
		);
		expect(closed.state).toMatchObject({ members: [a.id], retained: [a.id] });
		const rows = closed.built.evaluator.evaluate(closed.built.compiled.views[0], closed.state).rows;
		expect(rows).toMatchObject([{ itemId: a.id, retained: false }]);
		const leftSearch = step(
			{ views: both, items: [item(merged(5))], results: { 0: [], 1: [] } },
			closed.state
		);
		expect(leftSearch.state.retained).toEqual([a.id]);
	});

	it('lists closed items of a closed-item search as ordinary members, also with retention off', () => {
		const done = merged((3 * DAY_MS) / MINUTE_MS);
		const search = [view('v', ['is:pr is:merged repo:PostHog/posthog'], { keepClosed: false })];
		const result = step({ views: search, items: [item(done)], results: { 0: [done.id] } }, null);
		expect(result.state.members).toEqual([done.id]);
	});
});

describe('interest', () => {
	it('covers members, retained items, and hidden candidates, and nothing that left', () => {
		const shown = facts(1);
		const hidden = facts(2, { additions: 900, deletions: 900 });
		const small = [view('v', ['is:pr is:open repo:PostHog/posthog size:<50'])];
		const result = step(
			{ views: small, items: [item(shown), item(hidden)], results: { 0: [shown.id, hidden.id] } },
			null
		);
		const state = { ...result.state, retained: ['PR_closed'] };
		expect([...interestOf([state], [result.found])].sort()).toEqual(
			[shown.id, hidden.id, 'PR_closed'].sort()
		);
	});
});

describe('reseeding after a pause', () => {
	it('waits for a fresh search before it seeds again', () => {
		const a = facts(1);
		const b = facts(2);
		const seeded = step(
			{ views: [view('v', open)], items: [item(a), item(b)], results: { 0: [a.id] } },
			null
		);
		const awaiting = {
			...seeded.state,
			seededBindings: [],
			baseline: [],
			awaitingRefresh: [...seeded.state.seededBindings]
		};
		const stale = step(
			{ views: [view('v', open)], items: [item(a), item(b)], results: { 0: [a.id] } },
			awaiting
		);
		expect(stale.state.seededBindings).toEqual([]);
		const built = world({
			views: [view('v', open)],
			items: [item(a), item(b)],
			results: { 0: [a.id, b.id] }
		});
		const compiled = built.compiled.views[0];
		const fresh = transitionView(
			compiled,
			stale.state,
			built.evaluator.membership(compiled),
			{
				...built.evaluation,
				closedNow: new Set(),
				freshSources: new Set([compiled.clauses[0].sourceId])
			},
			'observation'
		);
		expect(fresh.admitted).toEqual([]);
		expect(fresh.state.awaitingRefresh).toEqual([]);
	});
});

describe('waiting for a fresh search', () => {
	it('neither admits nor alerts for an item only a waiting binding supports', () => {
		const a = facts(1);
		const unread = step({ views: [view('v', open)], items: [], results: { 0: [a.id] } }, null);
		const awaiting = {
			...unread.state,
			seededBindings: [],
			baseline: [],
			awaitingRefresh: [...unread.state.seededBindings]
		};
		const readLater = step(
			{ views: [view('v', open)], items: [item(a)], results: { 0: [a.id] } },
			awaiting
		);
		expect(readLater.admitted).toEqual([]);
		expect(readLater.quiet.has(a.id)).toBe(true);
		expect(readLater.state.members).toEqual([a.id]);
	});
});

describe('waiting bindings and filters', () => {
	it('keeps quiet an item that only a waiting binding accepts, even when an established binding finds and rejects it', () => {
		const high = facts(1, { additions: 900, deletions: 900 });
		const two = [
			view('v', ['is:pr is:open repo:PostHog/posthog', 'is:pr is:open org:PostHog size:<50'])
		];
		const first = step(
			{ views: two, items: [item(high)], results: { 0: [high.id], 1: [high.id] } },
			null
		);
		const [established, rejecting] = first.built.compiled.views[0].clauses.map((c) => c.binding);
		const awaiting = {
			...first.state,
			seededBindings: [rejecting],
			baseline: [],
			awaitingRefresh: [established]
		};
		const later = step(
			{ views: two, items: [item(high)], results: { 0: [high.id], 1: [high.id] } },
			awaiting
		);
		expect(later.quiet.has(high.id)).toBe(true);
		expect(later.admitted).toEqual([]);
	});
});
