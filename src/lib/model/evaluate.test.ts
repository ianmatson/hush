import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../shared/changes';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../shared/durations';
import { conditionId } from '../shared/decisions';
import type { CategoryGroup } from '../shared/types';
import { analysisView } from './analysis';
import {
	BY_TOPIC,
	EFFORT,
	IMPACT,
	ANALYSIS_VERSION,
	ME,
	NOW,
	answeredEffort,
	facts,
	item,
	noAttention,
	view,
	world
} from './testing';

const ids = (rows: { itemId: string }[]) => rows.map((row) => row.itemId).sort();

describe('membership', () => {
	it('applies each search filter only to the results of its own search', () => {
		const small = facts(1, { additions: 5, deletions: 5 });
		const big = facts(2, { additions: 500, deletions: 500 });
		const w = world({
			views: [
				view('v', ['is:pr is:open repo:PostHog/posthog size:<50', 'is:pr is:open author:@me'])
			],
			items: [item(small), item(big)],
			results: { 0: [small.id, big.id], 1: [] }
		});
		expect([...w.evaluator.membership(w.compiled.views[0]).members]).toEqual([small.id]);
	});

	it('hides bot PRs found by a search, and keeps them when a board finds them', () => {
		const bot = facts(3, { author: 'dependabot', authorIsBot: true });
		const w = world({
			views: [
				view('search', ['is:pr is:open repo:PostHog/posthog']),
				view('board', ['project:PostHog/7 status:Doing'])
			],
			items: [item(bot)],
			results: { 0: [bot.id], 1: [bot.id], 2: [bot.id] }
		});
		const [search, board] = w.compiled.views.map((v) => w.evaluator.membership(v).members);
		expect(search.size).toBe(0);
		expect(board.has(bot.id)).toBe(true);
	});

	it('drops a closed item from an open-only search at once, before the search runs again', () => {
		const closed = facts(4, { state: 'merged', closedAt: new Date(NOW - MINUTE_MS).toISOString() });
		const w = world({
			views: [view('v', ['is:pr is:open repo:PostHog/posthog'])],
			items: [item(closed)],
			results: { 0: [closed.id] }
		});
		expect(w.evaluator.membership(w.compiled.views[0]).members.size).toBe(0);
	});

	it('keeps a candidate that has no facts yet out of the view, as unsettled', () => {
		const w = world({
			views: [view('v', ['is:pr is:open'])],
			items: [],
			results: { 0: ['PR_new'] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.size).toBe(0);
		expect([...found.unsettled]).toEqual(['PR_new']);
	});

	it('treats a source that failed for over an hour as unknown, and keeps a stale one', () => {
		const one = facts(5);
		const failedAt = (minutesAgo: number) => () => ({
			failedSince: NOW - minutesAgo * MINUTE_MS,
			error: 'timeout'
		});
		const membersWith = (minutesAgo: number) => {
			const w = world({
				views: [view('v', ['is:pr is:open'])],
				items: [item(one)],
				results: { 0: [one.id] },
				sources: failedAt(minutesAgo)
			});
			const found = w.evaluator.membership(w.compiled.views[0]);
			return { members: found.members.size, health: found.health[0] };
		};
		expect(membersWith(30)).toMatchObject({ members: 1, health: { stale: true } });
		expect(membersWith(61)).toMatchObject({ members: 0, health: { unknown: true } });
	});
});

describe('categories in view searches', () => {
	const lowEffort = 'is:pr is:open category:effort/low';

	it('waits for the first answer: no membership, unsettled, also for a negated filter', () => {
		const pr = facts(6);
		for (const search of [lowEffort, 'is:pr is:open -category:effort/low']) {
			const w = world({ views: [view('v', [search])], items: [item(pr)], results: { 0: [pr.id] } });
			const found = w.evaluator.membership(w.compiled.views[0]);
			expect(found.members.size).toBe(0);
			expect(found.unsettled.has(pr.id)).toBe(true);
		}
	});

	it('uses the last answer while a new one is on its way, and stays unsettled', () => {
		const pr = facts(7);
		const w = world({
			views: [view('v', [lowEffort])],
			items: [item(pr, { analysis: answeredEffort(pr, 'low', true) })],
			results: { 0: [pr.id] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.has(pr.id)).toBe(true);
		expect(found.unsettled.has(pr.id)).toBe(true);
		expect(w.evaluator.evaluate(w.compiled.views[0], null).rows[0].analysisStale).toBe(true);
	});

	it('settles with a current answer', () => {
		const pr = facts(8);
		const w = world({
			views: [view('v', [lowEffort])],
			items: [item(pr, { analysis: answeredEffort(pr, 'low') })],
			results: { 0: [pr.id] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.has(pr.id)).toBe(true);
		expect(found.unsettled.size).toBe(0);
	});

	it('does not wait for answers when smart decisions are off', () => {
		const pr = facts(9);
		const w = world({
			views: [view('v', ['is:pr is:open -category:effort/low'])],
			items: [item(pr)],
			results: { 0: [pr.id] },
			smartDecisions: false
		});
		expect(w.evaluator.membership(w.compiled.views[0]).members.has(pr.id)).toBe(true);
	});

	it('pins settle the category without any answer', () => {
		const pr = facts(10);
		const w = world({
			views: [view('v', [lowEffort])],
			items: [item(pr, { attention: { ...noAttention(), pins: ['low'] } })],
			results: { 0: [pr.id] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.has(pr.id)).toBe(true);
		expect(found.unsettled.size).toBe(0);
	});
});

describe('unknown answers', () => {
	it('keeps an about: rule unknown until it is answered, also when negated', () => {
		const pr = facts(20);
		const topicView = [view('v', ['is:pr is:open category:topic/other'])];
		const w = world({
			views: topicView,
			items: [item(pr)],
			results: { 0: [pr.id] },
			compile: { categoryGroups: [BY_TOPIC] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.size).toBe(0);
		expect(found.unsettled.has(pr.id)).toBe(true);
		const answered = item(pr, {
			analysis: {
				...answeredEffort(pr, 'low'),
				choices: {},
				about: { [conditionId('database migrations')]: 0.01 }
			}
		});
		const after = world({
			views: topicView,
			items: [answered],
			results: { 0: [pr.id] },
			compile: { categoryGroups: [BY_TOPIC] }
		});
		const settled = after.evaluator.membership(after.compiled.views[0]);
		expect(settled.members.has(pr.id)).toBe(true);
		expect(settled.unsettled.size).toBe(0);
	});

	it('does not treat an answer set without this group as an answer for it', () => {
		const pr = facts(21);
		const otherGroupOnly = item(pr, { analysis: { ...answeredEffort(pr, 'low'), choices: {} } });
		const w = world({
			views: [view('v', ['is:pr is:open -category:effort/low'])],
			items: [otherGroupOnly],
			results: { 0: [pr.id] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.size).toBe(0);
		expect(found.unsettled.has(pr.id)).toBe(true);
	});

	it('settles with a pin, whatever other groups still wait for', () => {
		const pr = facts(22);
		const w = world({
			views: [view('v', ['is:pr is:open category:effort/low'])],
			items: [item(pr, { attention: { ...noAttention(), pins: ['low'] } })],
			results: { 0: [pr.id] },
			compile: { categoryGroups: [EFFORT, IMPACT] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.has(pr.id)).toBe(true);
		expect(found.unsettled.size).toBe(0);
	});

	it('settles a rejection from known facts without waiting for answers', () => {
		const big = facts(23, { additions: 500, deletions: 500 });
		const w = world({
			views: [view('v', ['is:pr is:open size:<50 category:effort/low'])],
			items: [item(big)],
			results: { 0: [big.id] }
		});
		const found = w.evaluator.membership(w.compiled.views[0]);
		expect(found.members.size).toBe(0);
		expect(found.unsettled.size).toBe(0);
	});

	it('ignores stored answers while smart decisions are off', () => {
		const pr = facts(24);
		const w = world({
			views: [view('v', ['is:pr is:open category:effort/low'])],
			items: [item(pr, { analysis: answeredEffort(pr, 'low') })],
			results: { 0: [pr.id] },
			smartDecisions: false
		});
		expect(w.evaluator.membership(w.compiled.views[0]).members.size).toBe(0);
	});
});

describe('time', () => {
	it('evaluates category rules at the given time, not the wall clock', () => {
		const pr = facts(25, { updatedAt: new Date(NOW - 36 * HOUR_MS).toISOString() });
		const fresh: CategoryGroup = {
			id: 'age',
			name: 'Age',
			categories: [
				{
					id: 'fresh',
					name: 'Fresh',
					color: 'green',
					icon: 'lucide:leaf',
					rule: 'updated:>=@today-1d',
					description: ''
				}
			]
		};
		const membersAt = (now: number) => {
			const w = world({
				views: [view('v', ['is:pr is:open category:age/fresh'])],
				items: [item(pr)],
				results: { 0: [pr.id] },
				now,
				compile: { categoryGroups: [fresh] }
			});
			const result = w.evaluator.evaluate(w.compiled.views[0], null);
			return { size: result.membership.members.size, boundary: result.nextBoundary };
		};
		const today = membersAt(NOW);
		expect(today.size).toBe(1);
		expect(today.boundary).toBe(Date.parse('2026-10-23T00:00:00Z'));
		expect(membersAt(NOW + 2 * DAY_MS).size).toBe(0);
	});
});

describe('analysis', () => {
	it('never uses a reply or urgency answer about other content or other roles', () => {
		const requested = facts(11, { reviewRequests: [{ name: ME, team: false }] });
		const answered = { ...answeredEffort(requested, 'low'), reply: 0.99, urgency: 99 };
		const current = analysisView(answered, requested, ME, true, ANALYSIS_VERSION).decisions;
		expect(current).toMatchObject({ commentsNeedMe: true, urgent: true });
		const noLongerRequested = { ...requested, reviewRequests: [] };
		expect(
			analysisView(answered, noLongerRequested, ME, true, ANALYSIS_VERSION).decisions
		).toMatchObject({ commentsNeedMe: null, urgent: false });
	});

	it('ignores answers from another question-set version', () => {
		const pr = facts(12);
		expect(analysisView(answeredEffort(pr, 'low'), pr, ME, true, 'v2').lenient.choices.size).toBe(
			0
		);
	});
});

describe('rows', () => {
	it('keeps snoozed and muted items as members, and marks them put aside', () => {
		const snoozed = facts(13);
		const muted = facts(14);
		const until = NOW + HOUR_MS;
		const w = world({
			views: [view('v', ['is:pr is:open'])],
			items: [
				item(snoozed, {
					attention: { ...noAttention(), snooze: { kind: 'time', id: 's1', at: NOW, until } }
				}),
				item(muted, { attention: { ...noAttention(), muted: true } })
			],
			results: { 0: [snoozed.id, muted.id] }
		});
		const result = w.evaluator.evaluate(w.compiled.views[0], null);
		expect(result.membership.members.size).toBe(2);
		expect(result.rows.every((row) => row.dismissed)).toBe(true);
		expect(result.rows.find((row) => row.itemId === muted.id)?.muted).toBe(true);
		expect(result.nextBoundary).toBe(until);
	});

	it('wakes an activity snooze when GitHub shows newer activity', () => {
		const pr = facts(15, { updatedAt: new Date(NOW).toISOString() });
		const snooze = {
			kind: 'activity' as const,
			id: 's2',
			at: NOW - HOUR_MS,
			activityAt: new Date(NOW - HOUR_MS).toISOString()
		};
		const w = world({
			views: [view('v', ['is:pr is:open'])],
			items: [item(pr, { attention: { ...noAttention(), snooze } })],
			results: { 0: [pr.id] }
		});
		expect(w.evaluator.evaluate(w.compiled.views[0], null).rows[0].dismissed).toBe(false);
	});

	it('shows what changed since you looked, and labels alone do not make an item unread', () => {
		const before = facts(16);
		const relabeled = { ...before, labels: [{ name: 'bug', color: 'red' }] };
		const recommented = { ...before, comments: 2 };
		const seen = { at: NOW - HOUR_MS, revision: 1, snapshot: snapshotOf(before, ME) };
		const rowFor = (subject: typeof before) => {
			const w = world({
				views: [view('v', ['is:pr is:open'])],
				items: [item(subject, { attention: { ...noAttention(), seen } })],
				results: { 0: [subject.id] }
			});
			return w.evaluator.evaluate(w.compiled.views[0], null).rows[0];
		};
		expect(rowFor(relabeled)).toMatchObject({ unread: false, seenAt: seen.at });
		expect(rowFor(recommented)).toMatchObject({ unread: true });
		expect(rowFor(recommented).changes?.[0].kind).toBe('comments');
	});

	it('gives the same turn in every view, whatever the view is called', () => {
		const pr = facts(17);
		const w = world({
			views: [view('Website', ['is:pr is:open']), view('Infra', ['is:pr is:open author:alice'])],
			items: [item(pr)],
			results: { 0: [pr.id], 1: [pr.id] }
		});
		const [a, b] = w.compiled.views.map((v) => w.evaluator.evaluate(v, null).rows[0]);
		expect(a.turnReason).toBe(b.turnReason);
	});

	it('shows project status only when it is known', () => {
		const pr = facts(18);
		const w = world({
			views: [view('v', ['is:pr is:open'])],
			items: [
				item(pr, { project: { state: 'known', statuses: { 'PostHog/7': 'doing' }, stale: false } }),
				item(facts(19), { project: { state: 'unknown' } })
			],
			results: { 0: [pr.id, 'PR_19'] }
		});
		const rows = w.evaluator.evaluate(w.compiled.views[0], null).rows;
		expect(rows.find((r) => r.itemId === pr.id)).toMatchObject({
			projectStatus: { 'PostHog/7': 'doing' }
		});
		expect(rows.find((r) => r.itemId === 'PR_19')).toMatchObject({ projectStatusUnknown: true });
		expect(ids(rows)).toEqual([pr.id, 'PR_19'].sort());
	});
});
