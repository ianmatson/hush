import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../../src/lib/shared/changes';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../src/lib/shared/durations';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { ItemView, Settings } from '../../src/lib/shared/types';
import { compileViews } from '../../src/lib/model/compile';
import { ANALYSIS_VERSION, EFFORT, ME, NOW, facts } from '../../src/lib/model/testing';
import type { ItemId, SourceWindow } from '../../src/lib/model/types';
import { commit, type Input, type WorkspaceData } from '../workspace/commit';

const open = 'is:pr is:open repo:PostHog/posthog';

function settingsWith(views: ItemView[], over: Partial<Settings> = {}): Settings {
	return {
		...DEFAULT_SETTINGS,
		categoryGroups: [EFFORT],
		pushFacts: ['review-requested', 'snooze-over', 'ci-failed'],
		views,
		...over
	};
}

function empty(settings: Settings): WorkspaceData {
	return {
		config: {
			me: ME,
			settings,
			teams: [],
			projectAccess: 'none',
			analysisVersion: ANALYSIS_VERSION
		},
		items: new Map(),
		sources: new Map(),
		views: new Map(),
		revision: 0
	};
}

const windowOf = (ids: ItemId[], at = NOW): SourceWindow => ({
	candidates: ids.map((id) => ({ id, updatedAt: new Date(at).toISOString() })),
	truncated: false
});

function sourceIdOf(data: WorkspaceData, viewIndex = 0, clauseIndex = 0) {
	const { settings, teams, analysisVersion } = data.config;
	return compileViews(settings.views, {
		dash: settings.dash,
		categoryGroups: settings.categoryGroups,
		smartDecisions: settings.smartDecisions,
		teams,
		analysisVersion,
		now: NOW
	}).views[viewIndex].clauses[clauseIndex].sourceId;
}

function run(data: WorkspaceData, inputs: Input | Input[], now = NOW) {
	return commit(data, inputs, now);
}

function seeded(views: ItemView[], ids: ItemId[], over: Partial<Settings> = {}) {
	const start = run(empty(settingsWith(views, over)), { kind: 'time' });
	const withItems = run(start.data, {
		kind: 'items',
		read: ids.map((id) => facts(Number(id.slice(3)))),
		inaccessible: [],
		quiet: false
	});
	return run(withItems.data, {
		kind: 'source',
		sourceId: sourceIdOf(withItems.data),
		read: { outcome: 'ok', window: windowOf(ids) }
	});
}

describe('commit: facts', () => {
	it('stores a new item once, and ignores the same facts again', () => {
		const first = run(empty(settingsWith([])), {
			kind: 'items',
			read: [facts(1)],
			inaccessible: [],
			quiet: false
		});
		expect(first.data.items.get('PR_1')).toMatchObject({
			revision: 1,
			project: { state: 'unavailable' }
		});
		expect(first.data.revision).toBe(1);
		const again = run(first.data, {
			kind: 'items',
			read: [facts(1)],
			inaccessible: [],
			quiet: false
		});
		expect(again.changes.items.size).toBe(0);
		expect(again.data.revision).toBe(1);
	});

	it('accepts new CI with an equal update time, and ignores an older read', () => {
		const first = run(empty(settingsWith([])), {
			kind: 'items',
			read: [facts(1, { ci: 'PENDING' })],
			inaccessible: [],
			quiet: false
		});
		const sameTime = run(first.data, {
			kind: 'items',
			read: [facts(1, { ci: 'FAILURE' })],
			inaccessible: [],
			quiet: false
		});
		expect(sameTime.data.items.get('PR_1')?.facts.ci).toBe('FAILURE');
		const older = run(sameTime.data, {
			kind: 'items',
			read: [facts(1, { ci: 'SUCCESS', updatedAt: new Date(NOW - DAY_MS).toISOString() })],
			inaccessible: [],
			quiet: false
		});
		expect(older.data.items.get('PR_1')?.facts.ci).toBe('FAILURE');
	});

	it('removes an item the user can no longer read', () => {
		const first = seeded([{ id: 'v', name: 'v', searches: [open], groupBy: 'none' }], ['PR_1']);
		const gone = run(first.data, { kind: 'items', read: [], inaccessible: ['PR_1'], quiet: false });
		expect(gone.data.items.has('PR_1')).toBe(false);
		expect(gone.data.views.get('v')?.members).toEqual([]);
	});
});

describe('commit: alerts', () => {
	const views: ItemView[] = [
		{ id: 'v', name: 'Website', searches: [open], groupBy: 'none', pushNew: true }
	];
	const requested = facts(1, { reviewRequests: [{ name: ME, team: false }] });

	it('alerts on a wanted fact for an item in a view, and not for other items', () => {
		const base = seeded(views, ['PR_1']);
		const read = run(base.data, {
			kind: 'items',
			read: [requested, facts(9, { reviewRequests: [{ name: ME, team: false }] })],
			inaccessible: [],
			quiet: false
		});
		expect(read.alerts.map((a) => [a.itemId, a.reasons])).toEqual([['PR_1', ['review-requested']]]);
	});

	it('sends nothing for a quiet read, or for a muted item', () => {
		const base = seeded(views, ['PR_1']);
		expect(
			run(base.data, { kind: 'items', read: [requested], inaccessible: [], quiet: true }).alerts
		).toEqual([]);
		const muted = run(base.data, { kind: 'mute', itemIds: ['PR_1'], muted: true });
		expect(
			run(muted.data, { kind: 'items', read: [requested], inaccessible: [], quiet: false }).alerts
		).toEqual([]);
	});

	it('seeds the first search result quietly, then alerts new items, in one alert with other causes', () => {
		const base = seeded(views, ['PR_1']);
		expect(base.alerts).toEqual([]);
		const newcomer = facts(2, {
			reviewRequests: [{ name: ME, team: false }],
			requestEvents: [{ at: new Date(NOW - MINUTE_MS).toISOString(), team: false, name: ME }]
		});
		const arrives = run(base.data, [
			{ kind: 'items', read: [newcomer], inaccessible: [], quiet: false },
			{
				kind: 'source',
				sourceId: sourceIdOf(base.data),
				read: { outcome: 'ok', window: windowOf(['PR_1', 'PR_2']) }
			}
		]);
		expect(arrives.alerts).toHaveLength(1);
		expect(arrives.alerts[0]).toMatchObject({
			itemId: 'PR_2',
			reasons: ['review-requested', 'new-item'],
			title: 'Review requested · New in Website'
		});
	});

	it('does not announce your own new items', () => {
		const base = seeded(views, ['PR_1']);
		const mine = facts(3, { author: ME });
		const arrives = run(base.data, [
			{ kind: 'items', read: [mine], inaccessible: [], quiet: false },
			{
				kind: 'source',
				sourceId: sourceIdOf(base.data),
				read: { outcome: 'ok', window: windowOf(['PR_1', 'PR_3']) }
			}
		]);
		expect(arrives.alerts).toEqual([]);
	});

	it('consumes a finished event snooze once and alerts that it is over', () => {
		const base = seeded(views, ['PR_1']);
		const snoozed = run(base.data, {
			kind: 'snooze',
			itemIds: ['PR_1'],
			snooze: { kind: 'event', id: 's1', at: NOW - HOUR_MS, event: 'merged', until: NOW + DAY_MS }
		});
		const merged = run(snoozed.data, {
			kind: 'items',
			read: [
				facts(1, {
					state: 'merged',
					closedAt: new Date(NOW).toISOString(),
					updatedAt: new Date(NOW).toISOString()
				})
			],
			inaccessible: [],
			quiet: false
		});
		expect(merged.data.items.get('PR_1')?.attention.snooze).toBeNull();
		expect(merged.alerts.map((a) => a.reasons)).toEqual([['snooze-over']]);
		expect(run(merged.data, { kind: 'time' }, NOW + MINUTE_MS).alerts).toEqual([]);
	});

	it('ends a time snooze without an alert', () => {
		const base = seeded(views, ['PR_1']);
		const snoozed = run(base.data, {
			kind: 'snooze',
			itemIds: ['PR_1'],
			snooze: { kind: 'time', id: 's2', at: NOW, until: NOW + HOUR_MS }
		});
		const later = run(snoozed.data, { kind: 'time' }, NOW + HOUR_MS);
		expect(later.data.items.get('PR_1')?.attention.snooze).toBeNull();
		expect(later.alerts).toEqual([]);
	});
});

describe('commit: views and sources', () => {
	it('keeps a member that closed, from the reads committed with the search result', () => {
		const views: ItemView[] = [{ id: 'v', name: 'v', searches: [open], groupBy: 'none' }];
		const base = seeded(views, ['PR_1']);
		const result = run(base.data, [
			{
				kind: 'source',
				sourceId: sourceIdOf(base.data),
				read: { outcome: 'ok', window: windowOf([]) }
			},
			{
				kind: 'items',
				read: [
					facts(1, {
						state: 'merged',
						closedAt: new Date(NOW).toISOString(),
						updatedAt: new Date(NOW).toISOString()
					})
				],
				inaccessible: [],
				quiet: false
			}
		]);
		expect(result.data.views.get('v')).toMatchObject({ members: [], retained: ['PR_1'] });
		expect(result.departed).toEqual(['PR_1']);
	});

	it('drops sources and view state that settings no longer use, and starts edited views quietly', () => {
		const views: ItemView[] = [
			{ id: 'v', name: 'v', searches: [open], groupBy: 'none', pushNew: true }
		];
		const base = seeded(views, ['PR_1']);
		const edited = run(base.data, {
			kind: 'settings',
			settings: settingsWith([
				{ id: 'w', name: 'w', searches: ['is:issue is:open'], groupBy: 'none' }
			])
		});
		expect(edited.changes.removedViews).toEqual(new Set(['v']));
		expect(edited.changes.removedSources.size).toBe(1);
		expect([...edited.data.sources.values()].map((s) => s.spec.query)).toEqual([
			expect.stringContaining('is:issue')
		]);
	});

	it('keeps a failed search result as stale evidence', () => {
		const views: ItemView[] = [{ id: 'v', name: 'v', searches: [open], groupBy: 'none' }];
		const base = seeded(views, ['PR_1']);
		const failed = run(base.data, {
			kind: 'source',
			sourceId: sourceIdOf(base.data),
			read: { outcome: 'failed', error: 'timeout' }
		});
		expect(failed.data.views.get('v')?.members).toEqual(['PR_1']);
	});

	it('records interest in members and hidden candidates', () => {
		const views: ItemView[] = [
			{ id: 'v', name: 'v', searches: [`${open} size:<50`], groupBy: 'none' }
		];
		const base = seeded(views, ['PR_1']);
		expect([...base.interest]).toEqual(['PR_1']);
	});
});

describe('commit: attention', () => {
	const views: ItemView[] = [{ id: 'v', name: 'v', searches: [open], groupBy: 'none' }];

	it('ignores a seen mark for an older revision than the one already seen', () => {
		const base = seeded(views, ['PR_1']);
		const snapshot = snapshotOf(facts(1), ME);
		const seen = run(base.data, { kind: 'seen', itemId: 'PR_1', revision: 3, snapshot });
		const older = run(seen.data, { kind: 'seen', itemId: 'PR_1', revision: 2, snapshot });
		expect(older.data.items.get('PR_1')?.attention.seen?.revision).toBe(3);
		expect(older.changes.items.size).toBe(0);
	});

	it('pins a category, and a pin never announces the item as new', () => {
		const lowViews: ItemView[] = [
			{
				id: 'v',
				name: 'v',
				searches: [`${open} category:effort/low`],
				groupBy: 'none',
				pushNew: true
			}
		];
		const base = seeded(lowViews, ['PR_1'], { smartDecisions: false });
		const pinned = run(base.data, {
			kind: 'pin',
			itemIds: ['PR_1'],
			pin: { group: 'effort', category: 'low' }
		});
		expect(pinned.data.items.get('PR_1')?.attention.pins).toEqual(['low']);
		expect(pinned.data.views.get('v')?.members).toEqual(['PR_1']);
		expect(pinned.alerts).toEqual([]);
	});
});

describe('commit: change reporting', () => {
	const views: ItemView[] = [
		{ id: 'v', name: 'v', searches: [open], groupBy: 'none', pushNew: true }
	];

	it('announces a view whose search failed, even with the same members', () => {
		const base = seeded(views, ['PR_1']);
		const failed = run(base.data, {
			kind: 'source',
			sourceId: sourceIdOf(base.data),
			read: { outcome: 'failed', error: 'timeout' }
		});
		expect(failed.changedViews).toEqual(['v']);
	});

	it('writes nothing for the same search result again', () => {
		const base = seeded(views, ['PR_1']);
		const again = run(base.data, {
			kind: 'source',
			sourceId: sourceIdOf(base.data),
			read: { outcome: 'ok', window: windowOf(['PR_1']) }
		});
		expect(again.changes.sources.size).toBe(0);
		expect(again.data.revision).toBe(base.data.revision);
	});

	it('gives a re-entry its own alert id', () => {
		const base = seeded(views, ['PR_1']);
		const sourceId = sourceIdOf(base.data);
		const ok = (ids: string[]): Input => ({
			kind: 'source',
			sourceId,
			read: { outcome: 'ok', window: windowOf(ids) }
		});
		const second = run(base.data, [
			{ kind: 'items', read: [facts(2)], inaccessible: [], quiet: false },
			ok(['PR_1', 'PR_2'])
		]);
		const left = run(second.data, ok(['PR_1']));
		const back = run(left.data, ok(['PR_1', 'PR_2']));
		expect(second.alerts[0].id).not.toBe(back.alerts[0].id);
	});
});

describe('commit: quiet per view', () => {
	it('lets an established view alert while a new view still waits on an answer', () => {
		const website: ItemView = { id: 'v', name: 'Website', searches: [open], groupBy: 'none' };
		const base = seeded([website], ['PR_1']);
		const lowEffort: ItemView = {
			id: 'low',
			name: 'Low',
			searches: [`${open} category:effort/low`],
			groupBy: 'none'
		};
		const added = run(base.data, {
			kind: 'settings',
			settings: settingsWith([website, lowEffort])
		});
		expect(added.data.views.get('low')?.baseline).toEqual(['PR_1']);
		const requested = facts(1, {
			updatedAt: new Date(NOW + MINUTE_MS).toISOString(),
			reviewRequests: [{ name: ME, team: false }]
		});
		const read = run(added.data, {
			kind: 'items',
			read: [requested],
			inaccessible: [],
			quiet: false
		});
		expect(read.alerts.map((a) => a.reasons)).toEqual([['review-requested']]);
	});
});
