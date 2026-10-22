import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '../../src/lib/shared/durations';
import type { ItemView } from '../../src/lib/shared/types';
import { NOW, facts } from '../../src/lib/model/testing';
import { ROUTES_KEY, WorkspaceEngine } from '../workspace/engine';
import type { RouteTable } from '../workspace/routes';
import {
	initialSync,
	readRetryDelay,
	readsFailed,
	renewReads,
	requestReads,
	ROUTES_RETRY_MS
} from '../workspace/work';
import { configWith, harness, settingsWith, windowOf } from './workspace-fixtures';

const views: ItemView[] = [
	{ id: 'v', name: 'Website', searches: ['is:pr is:open repo:PostHog/posthog'], groupBy: 'none' }
];

class FakeRouteTable implements RouteTable {
	rows = new Set<string>();
	cleared = 0;
	failNext = false;
	beforeApply: (() => Promise<void>) | null = null;

	async list() {
		return [...this.rows];
	}

	async apply(add: string[], remove: string[]) {
		await this.beforeApply?.();
		if (this.failNext) {
			this.failNext = false;
			throw new Error('D1 is down');
		}
		for (const route of add) this.rows.add(route);
		for (const route of remove) this.rows.delete(route);
	}

	async clear() {
		this.cleared++;
		this.rows.clear();
	}
}

const answerSearch = (ids: string[]) => (specs: { id: string }[]) =>
	new Map(
		specs.map((spec) => [spec.id, { outcome: 'ok' as const, window: windowOf(ids, NOW - HOUR_MS) }])
	);

async function tracking(ids = ['PR_1']) {
	const h = harness();
	const routes = new FakeRouteTable();
	h.deps.routes = routes;
	for (const id of ids) h.readers.facts.set(id, facts(Number(id.slice(3)), { repoId: 555 }));
	h.readers.sourceResults.push(answerSearch(ids));
	const workspace = WorkspaceEngine.create(h.deps, configWith(settingsWith(views)), h.clock());
	await workspace.run(h.clock);
	return { ...h, routes, workspace };
}

describe('read renewal', () => {
	it('keeps the backoff of a failed read when a webhook renews it', () => {
		const failed = readsFailed(
			requestReads(initialSync(NOW), ['PR_1'], 'background', NOW),
			{ PR_1: 1 },
			NOW
		);
		const renewed = renewReads(failed, ['PR_1'], NOW + 1);
		expect(renewed.reads.PR_1).toMatchObject({
			attempts: 1,
			notBefore: NOW + readRetryDelay(1),
			version: failed.reads.PR_1.version + 1
		});
	});

	it('backs off a renewed request when the read in flight fails', () => {
		const pending = requestReads(initialSync(NOW), ['PR_1'], 'background', NOW);
		const claim = { PR_1: pending.reads.PR_1.version };
		const renewed = renewReads(pending, ['PR_1'], NOW);
		const failed = readsFailed(renewed, claim, NOW);
		expect(failed.reads.PR_1).toMatchObject({
			attempts: 1,
			notBefore: NOW + readRetryDelay(1),
			version: renewed.reads.PR_1.version
		});
	});

	it('reads at once after an interactive request, also during a failing read', () => {
		const pending = requestReads(initialSync(NOW), ['PR_1'], 'background', NOW);
		const claim = { PR_1: pending.reads.PR_1.version };
		const peeked = requestReads(pending, ['PR_1'], 'interactive', NOW);
		expect(readsFailed(peeked, claim, NOW).reads.PR_1).toMatchObject({
			attempts: 0,
			notBefore: NOW
		});
	});
});

describe('Workspace.invalidate', () => {
	it('requests a read of a tracked item, and nothing for a route it does not track', async () => {
		const h = await tracking();
		h.workspace.invalidate(['555#2', '999#1'], h.clock());
		expect(h.workspace.schedule.reads).toEqual({});
		h.workspace.invalidate(['555#1'], h.clock());
		expect(Object.keys(h.workspace.schedule.reads)).toEqual(['PR_1']);
		expect(h.alarms.at(-1)).toBe(h.clock());
	});

	it('writes once for a burst before the next run', async () => {
		const h = await tracking();
		h.workspace.invalidate(['555#1'], h.clock());
		const version = h.workspace.schedule.reads.PR_1.version;
		h.workspace.invalidate(['555#1'], h.clock());
		expect(h.workspace.schedule.reads.PR_1.version).toBe(version);
	});

	it('asks for one more read when a delivery arrives during a read', async () => {
		const h = await tracking();
		h.workspace.invalidate(['555#1'], h.clock());
		h.readers.beforeItemsAnswer = () => h.workspace.invalidate(['555#1'], h.clock());
		await h.workspace.run(h.clock);
		expect(Object.keys(h.workspace.schedule.reads)).toEqual(['PR_1']);
	});

	it('does nothing for a Workspace that is not active', async () => {
		const h = await tracking();
		h.workspace.stop('Signed out');
		h.workspace.invalidate(['555#1'], h.clock());
		expect(h.workspace.schedule.reads).toEqual({});
	});
});

describe('route sync', () => {
	it('sends the routes of tracked items after the first run, and no route without a repository id', async () => {
		const h = harness();
		const routes = new FakeRouteTable();
		h.deps.routes = routes;
		h.readers.facts.set('PR_1', facts(1, { repoId: 555 }));
		h.readers.facts.set('PR_2', facts(2));
		h.readers.sourceResults.push(answerSearch(['PR_1', 'PR_2']));
		const workspace = WorkspaceEngine.create(h.deps, configWith(settingsWith(views)), h.clock());
		await workspace.run(h.clock);
		expect([...routes.rows]).toEqual(['555#1']);
		expect(h.store.readState(ROUTES_KEY)).toEqual(['555#1']);
		expect(workspace.schedule.routesDue).toBeNull();
	});

	it('retries a failed sync later, and still does the GitHub work of that run', async () => {
		const h = harness();
		const routes = new FakeRouteTable();
		routes.failNext = true;
		h.deps.routes = routes;
		h.readers.facts.set('PR_1', facts(1, { repoId: 555 }));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		const workspace = WorkspaceEngine.create(h.deps, configWith(settingsWith(views)), h.clock());
		await workspace.run(h.clock);
		expect(workspace.snapshot.items.has('PR_1')).toBe(true);
		expect(routes.rows.size).toBe(0);
		expect(workspace.schedule.routesDue).toBe(h.clock() + ROUTES_RETRY_MS);
		h.advance(ROUTES_RETRY_MS);
		await workspace.run(h.clock);
		expect([...routes.rows]).toEqual(['555#1']);
	});

	it('syncs routes while GitHub is rate-limited', async () => {
		const h = harness();
		const routes = new FakeRouteTable();
		h.deps.routes = routes;
		h.readers.facts.set('PR_1', facts(1, { repoId: 555 }));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		const workspace = WorkspaceEngine.create(h.deps, configWith(settingsWith(views)), h.clock());
		routes.failNext = true;
		await workspace.run(h.clock);
		h.readers.notificationResults.push({ status: 'rate-limited', retryAt: h.clock() + HOUR_MS });
		h.advance(ROUTES_RETRY_MS);
		workspace.touch(h.clock());
		await workspace.run(h.clock);
		expect(workspace.schedule.retryAt.github).toBeGreaterThan(h.clock());
		expect([...routes.rows]).toEqual(['555#1']);
	});

	it('clears its routes when it stops, and sends them all again after a restart', async () => {
		const h = await tracking();
		h.readers.notificationResults.push({ status: 'unauthorized' });
		h.advance(10 * MINUTE_MS);
		await h.workspace.run(h.clock);
		expect(h.routes.rows.size).toBe(0);
		expect(h.store.readState(ROUTES_KEY)).toEqual([]);
		h.workspace.restart(h.clock());
		await h.workspace.run(h.clock);
		expect([...h.routes.rows]).toEqual(['555#1']);
	});

	it('refuses the checkpoint of a batch that commits after a stop', async () => {
		const h = harness();
		const routes = new FakeRouteTable();
		h.deps.routes = routes;
		h.readers.facts.set('PR_1', facts(1, { repoId: 555 }));
		h.readers.sourceResults.push(answerSearch(['PR_1']));
		const workspace = WorkspaceEngine.create(h.deps, configWith(settingsWith(views)), h.clock());
		routes.beforeApply = async () => {
			routes.beforeApply = null;
			workspace.stop('Signed out');
		};
		await workspace.run(h.clock);
		expect(routes.rows.size).toBe(0);
		expect(h.store.readState(ROUTES_KEY) ?? []).toEqual([]);
	});

	it('repairs drift in the daily cleanup', async () => {
		const h = await tracking();
		h.routes.rows.clear();
		h.routes.rows.add('1#1');
		h.advance(25 * HOUR_MS);
		h.workspace.touch(h.clock());
		await h.workspace.run(h.clock);
		expect([...h.routes.rows]).toEqual(['555#1']);
	});
});
