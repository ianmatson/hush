import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../src/lib/shared/durations';
import type { ItemView } from '../../src/lib/shared/types';
import { ME, facts } from '../../src/lib/model/testing';
import type { DecisionRequest } from '../../src/lib/shared/decisions';
import { Workspace, type Analyzed } from '../workspace/workspace';
import { PAUSE_AFTER_NO_PUSH_MS, SOURCE_EVERY_MS } from '../workspace/work';
import { configWith, harness, settingsWith, windowOf } from './workspace-fixtures';

const views: ItemView[] = [
	{
		id: 'v',
		name: 'Website',
		searches: ['is:pr is:open repo:PostHog/posthog'],
		groupBy: 'none',
		pushNew: true
	}
];

function started() {
	const h = harness();
	const workspace = Workspace.create(h.deps, configWith(settingsWith(views)), h.clock());
	return { ...h, workspace };
}

const answerSearch = (ids: string[]) => (specs: { id: string }[]) => ({
	reads: new Map(specs.map((spec) => [spec.id, { outcome: 'ok' as const, window: windowOf(ids) }]))
});

describe('Workspace', () => {
	it('searches, reads what it found, and fills the view on the first run', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		expect(h.readers.itemCalls).toEqual([['PR_1']]);
		expect(h.workspace.snapshot.views.get('v')?.members).toEqual(['PR_1']);
		expect(h.announced.at(-1)?.viewIds).toEqual(['v']);
		expect(h.alarms.at(-1)).toBeGreaterThan(h.clock());
	});

	it('loads the same data and schedule back from storage', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		const reopened = Workspace.open(h.deps, h.clock())!;
		expect(reopened.snapshot.views.get('v')?.members).toEqual(['PR_1']);
		expect(reopened.snapshot.items.get('PR_1')?.facts.title).toBe('Change 1');
		expect(reopened.schedule.sourcesDue).toEqual(h.workspace.schedule.sourcesDue);
	});

	it('reads a tracked item again for its notification, and alerts once', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		h.advance(10 * MINUTE_MS);
		const requested = facts(1, {
			updatedAt: new Date(h.clock()).toISOString(),
			reviewRequests: [{ name: ME, team: false }]
		});
		h.readers.facts.set('PR_1', requested);
		h.readers.notificationResults.push({
			status: 'ok',
			threads: [
				{ id: 't1', updatedAt: requested.updatedAt, repo: 'posthog/posthog', number: 1, kind: 'pr' }
			],
			lastModified: 'x',
			pollIntervalMs: 60_000
		});
		await h.workspace.run(h.clock);
		expect(h.store.pendingAlerts().map((a) => [a.itemId, a.reasons])).toEqual([
			['PR_1', ['review-requested']]
		]);
		h.advance(10 * MINUTE_MS);
		h.readers.notificationResults.push({
			status: 'ok',
			threads: [
				{ id: 't1', updatedAt: requested.updatedAt, repo: 'posthog/posthog', number: 1, kind: 'pr' }
			],
			lastModified: 'y',
			pollIntervalMs: 60_000
		});
		const calls = h.readers.itemCalls.length;
		await h.workspace.run(h.clock);
		expect(h.readers.itemCalls.length).toBe(calls);
		expect(h.store.pendingAlerts()).toHaveLength(1);
	});

	it('brings searches forward for a notification about an item no view has, once per five minutes', async () => {
		const h = started();
		h.readers.sourceResults.push(answerSearch([]));
		await h.workspace.run(h.clock);
		const due = Object.values(h.workspace.schedule.sourcesDue)[0];
		expect(due).toBe(h.clock() + SOURCE_EVERY_MS);
		h.advance(6 * MINUTE_MS);
		h.readers.notificationResults.push({
			status: 'ok',
			threads: [
				{
					id: 't9',
					updatedAt: new Date(h.clock()).toISOString(),
					repo: 'posthog/posthog',
					number: 9,
					kind: 'pr'
				}
			],
			lastModified: 'x',
			pollIntervalMs: 60_000
		});
		h.readers.facts.set('PR_9', facts(9));
		h.readers.sourceResults.push(answerSearch(['PR_9']));
		await h.workspace.run(h.clock);
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.views.get('v')?.members).toEqual(['PR_9']);
	});

	it('reads a member that left a search before committing the result, and keeps it if it closed', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		h.advance(SOURCE_EVERY_MS);
		h.readers.facts.set(
			'PR_1',
			facts(1, {
				state: 'merged',
				closedAt: new Date(h.clock()).toISOString(),
				updatedAt: new Date(h.clock()).toISOString()
			})
		);
		h.readers.sourceResults.push(answerSearch([]));
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.views.get('v')).toMatchObject({ members: [], retained: ['PR_1'] });
	});

	it('waits for the rate limit before it asks GitHub again', async () => {
		const h = started();
		const retryAt = h.clock() + HOUR_MS;
		h.readers.notificationResults.push({ status: 'rate-limited', retryAt });
		await h.workspace.run(h.clock);
		expect(h.alarms.at(-1)).toBeGreaterThanOrEqual(retryAt);
	});

	it('stops and reports a rejected token, with no further alarm', async () => {
		const h = started();
		h.readers.notificationResults.push({ status: 'unauthorized' });
		await h.workspace.run(h.clock);
		expect(h.workspace.schedule.lifecycle).toBe('stopped');
		expect(h.rejectedCount()).toBe(1);
		expect(h.alarms.at(-1)).toBeNull();
	});

	it('drops the results of work that a stop overtook', async () => {
		const h = started();
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		h.readers.facts.set('PR_1', facts(1));
		await h.workspace.run(h.clock);
		h.advance(HOUR_MS + MINUTE_MS);
		h.readers.facts.set(
			'PR_1',
			facts(1, { title: 'Renamed', updatedAt: new Date(h.clock()).toISOString() })
		);
		h.readers.beforeItemsAnswer = () => h.workspace.stop('Signed out.');
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.get('PR_1')?.facts.title).toBe('Change 1');
	});

	it('pauses an account nobody opened for two weeks, and a visit resumes it', async () => {
		const h = started();
		h.advance(PAUSE_AFTER_NO_PUSH_MS + DAY_MS);
		await h.workspace.run(h.clock);
		expect(h.workspace.schedule.lifecycle).toBe('paused');
		expect(h.alarms.at(-1)).toBeNull();
		h.workspace.touch(h.clock());
		expect(h.workspace.schedule.lifecycle).toBe('active');
		expect(h.alarms.at(-1)).not.toBeNull();
	});

	it('wakes for the next time boundary even with no GitHub work due', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		const until = h.clock() + 2 * MINUTE_MS;
		h.workspace.apply(
			{
				kind: 'snooze',
				itemIds: ['PR_1'],
				snooze: { kind: 'time', id: 's', at: h.clock(), until }
			},
			h.clock()
		);
		expect(h.workspace.schedule.boundaryAt).toBe(until);
		expect(h.alarms.at(-1)).toBeLessThanOrEqual(until);
	});
});

describe('Workspace analysis', () => {
	const categoryViews: ItemView[] = [
		{
			id: 'low',
			name: 'Low',
			searches: ['is:pr is:open repo:PostHog/posthog category:effort/low'],
			groupBy: 'none'
		}
	];

	function withModel(answer: (request: DecisionRequest) => Analyzed | null) {
		const h = harness();
		const asked: DecisionRequest[] = [];
		h.readers.analyze = async (request) => {
			asked.push(request);
			return answer(request);
		};
		const workspace = Workspace.create(h.deps, configWith(settingsWith(categoryViews)), h.clock());
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		return { ...h, workspace, asked };
	}

	const choose =
		(category: string) =>
		(request: DecisionRequest): Analyzed => ({
			tokens: 100,
			answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [
					key,
					key.startsWith('choice_')
						? { type: 'choice', choice: category, confidence: 0.9 }
						: { type: 'score', score: 0 }
				])
			)
		});

	it('asks the model about items it found, and fills a category view quietly', async () => {
		const h = withModel(choose('low'));
		await h.workspace.run(h.clock);
		expect(h.asked.length).toBeGreaterThan(0);
		expect(h.workspace.snapshot.views.get('low')?.members).toEqual(['PR_1']);
		expect(h.store.pendingAlerts()).toEqual([]);
		expect(h.workspace.schedule.analysis).toEqual([]);
	});

	it('pauses analysis for the day when the token budget is spent', async () => {
		const h = withModel(choose('low'));
		h.deps.analysisBudget = 0;
		await h.workspace.run(h.clock);
		expect(h.asked).toEqual([]);
		expect(h.workspace.schedule.retryAt.ai).toBe(Date.parse('2026-10-23T00:00:00Z'));
	});

	it('drops an answer about facts that changed while the model worked', async () => {
		const h = withModel((request) => {
			h.workspace.apply(
				{
					kind: 'items',
					read: [facts(1, { title: 'Renamed', updatedAt: new Date(h.clock() + 1).toISOString() })],
					inaccessible: [],
					quiet: true
				},
				h.clock()
			);
			return choose('low')(request);
		});
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.get('PR_1')?.analysis?.choices ?? {}).toEqual({});
	});
});

describe('Workspace projects and teams', () => {
	const projectViews: ItemView[] = [
		{
			id: 'p',
			name: 'Board',
			searches: ['is:pr is:open repo:PostHog/posthog'],
			groupBy: 'project:PostHog/7'
		}
	];
	const definition = {
		key: 'PostHog/7',
		title: 'Website',
		url: 'https://github.com/orgs/PostHog/projects/7',
		statuses: []
	};

	function projectHarness() {
		const h = harness();
		const config = { ...configWith(settingsWith(projectViews)), projectAccess: 'read' as const };
		const workspace = Workspace.create(h.deps, config, h.clock());
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		return { ...h, workspace };
	}

	it('reads project status for members of project views, and keeps it stale after a failed read', async () => {
		const h = projectHarness();
		await h.workspace.run(h.clock);
		h.readers.projectStatuses = {
			statusOf: new Map([['PR_1', { 'PostHog/7': 'doing' }]]),
			incomplete: new Set(),
			definitions: [definition]
		};
		h.advance(SOURCE_EVERY_MS);
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.get('PR_1')?.project).toEqual({
			state: 'known',
			statuses: { 'PostHog/7': 'doing' },
			stale: false
		});
		expect(h.workspace.snapshot.config.projects).toEqual([definition]);
		h.readers.projectStatuses = {
			statusOf: new Map(),
			incomplete: new Set(['PR_1']),
			definitions: []
		};
		h.advance(SOURCE_EVERY_MS);
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.get('PR_1')?.project).toMatchObject({
			state: 'known',
			stale: true
		});
	});

	it('does not read projects without project access', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		expect(h.readers.projectCalls).toEqual([]);
	});

	it('refreshes teams every six hours, and keeps the last list when GitHub fails', async () => {
		const h = started();
		h.readers.teamsResult = [{ slug: 'posthog/web', name: 'Web', org: 'posthog' }];
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.config.teams.map((t) => t.slug)).toEqual(['posthog/web']);
		h.readers.teamsResult = null;
		h.advance(7 * HOUR_MS);
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.config.teams.map((t) => t.slug)).toEqual(['posthog/web']);
	});
});

describe('Workspace failures', () => {
	it('backs off a failed read, retries it, and gives up after five tries', async () => {
		const h = started();
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		expect(h.workspace.schedule.reads['PR_1']).toMatchObject({
			attempts: 1,
			notBefore: h.clock() + MINUTE_MS
		});
		expect(h.alarms.at(-1)).toBeGreaterThanOrEqual(h.clock() + MINUTE_MS);
		for (const wait of [1, 2, 4, 8]) {
			h.advance(wait * MINUTE_MS);
			await h.workspace.run(h.clock);
		}
		expect(h.workspace.schedule.reads['PR_1']).toBeUndefined();
		expect(h.readers.itemCalls).toHaveLength(5);
	});

	it('stops calling GitHub in the same run after a rate limit', async () => {
		const h = started();
		h.readers.notificationResults.push({ status: 'rate-limited', retryAt: h.clock() + HOUR_MS });
		await h.workspace.run(h.clock);
		expect(h.readers.sourceCalls).toBe(0);
	});

	it('keeps a read that was asked for again while the first read ran', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		h.readers.beforeItemsAnswer = () => {
			h.readers.beforeItemsAnswer = null;
			h.workspace.requestRead(['PR_1'], 'background', h.clock());
		};
		await h.workspace.run(h.clock);
		expect(h.workspace.schedule.reads['PR_1']).toBeDefined();
	});

	it('keeps memory equal to storage when a save fails', () => {
		const h = started();
		const save = h.store.save.bind(h.store);
		h.store.save = () => {
			throw new Error('disk full');
		};
		expect(() =>
			h.workspace.apply(
				{ kind: 'items', read: [facts(1)], inaccessible: [], quiet: false },
				h.clock()
			)
		).toThrow('disk full');
		expect(h.workspace.broken).toBe(true);
		expect(h.workspace.snapshot.items.has('PR_1')).toBe(false);
		h.store.save = save;
		const reopened = Workspace.open(h.deps, h.clock())!;
		reopened.apply({ kind: 'items', read: [facts(1)], inaccessible: [], quiet: false }, h.clock());
		expect(h.store.load()?.items.has('PR_1')).toBe(true);
	});

	it('keeps an item it read lately for 30 days after it leaves every view', async () => {
		const h = started();
		h.readers.facts.set('PR_1', facts(1));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		await h.workspace.run(h.clock);
		h.advance(SOURCE_EVERY_MS);
		h.readers.facts.set('PR_1', facts(1, { title: 'Still open' }));
		h.readers.sourceResults.push(answerSearch([]));
		await h.workspace.run(h.clock);
		h.advance(DAY_MS);
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.has('PR_1')).toBe(true);
		h.advance(30 * DAY_MS);
		h.workspace.touch(h.clock());
		await h.workspace.run(h.clock);
		expect(h.workspace.snapshot.items.has('PR_1')).toBe(false);
	});
});
