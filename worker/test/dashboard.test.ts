import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finishItem } from '../../src/lib/shared/dashboard';
import { sectionsFor } from '../../src/lib/shared/item-views';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import { dashFactsOf, subjectKey } from '../../src/lib/shared/subject';
import type { DashItem, DashResponse } from '../../src/lib/shared/types';
import type { Who } from '../poller/shared';
import { subjectFixture } from './subject-fixtures';

vi.mock('../poller/sync', () => ({ PollerSync: class {} }));
vi.mock('../github', async (importOriginal) => ({
	...(await importOriginal<typeof import('../github')>()),
	fetchDetails: vi.fn(),
	searchShort: vi.fn()
}));
vi.mock('../projects', () => ({ boardShort: vi.fn(), itemStatuses: vi.fn() }));
const { PollerDashboard } = await import('../poller/dashboard');
const { fetchDetails, searchShort } = await import('../github');
const { boardShort, itemStatuses } = await import('../projects');

class TestDashboard extends PollerDashboard {
	build() {
		return this.buildDashboard('pr', true);
	}
	incrementalBuild() {
		return this.buildDashboard('pr', true, false);
	}
	cachedBuild() {
		return this.buildDashboard('pr', false);
	}
	rebuildAfter(changedAt: number) {
		return this.rebuildTracked('pr', changedAt);
	}
}

function harness() {
	const settings = structuredClone(DEFAULT_SETTINGS);
	settings.views = [
		{
			id: 'website',
			name: 'Website',
			searches: ['project:sandbox/7 status:Todo'],
			groupBy: 'project:sandbox/7'
		},
		{ id: 'mine', name: 'Mine', searches: ['repo:sandbox/web is:open'], groupBy: 'role' }
	];
	const who: Who = { userId: 1, me: 'reviewer', token: 'test', settings, projectAccess: 'read' };
	const subjects = [subjectFixture(), subjectFixture({ id: 'PR_2', number: 2 })];
	const facts = new Map(
		subjects.map((subject) => [subjectKey(subject.repo, subject.number), subject])
	);
	const items = subjects.map((subject, index) => ({
		...finishItem(
			dashFactsOf(subject, who.me, new Set()),
			[index ? 'mine' : 'website'],
			[index ? 'Mine' : 'Website'],
			who.me,
			14
		),
		projectStatus: { 'sandbox/7': 'doing' }
	}));
	const sig = JSON.stringify([
		sectionsFor('pr', settings.views),
		settings.dash.excludedTeams,
		settings.dash.staleDays,
		settings.dash.hideOthersDrafts,
		settings.dash.hideBots
	]);
	const data: DashResponse = {
		kind: 'pr',
		items,
		projects: [],
		sections: settings.views.map((view) => ({ id: view.id, name: view.name, count: 1 })),
		teams: [],
		fetchedAt: Date.now(),
		errors: []
	};
	const storage = new Map<string, unknown>([['dash:pr', { sig, data }]]);
	const trackedBuild = vi.fn();
	const poller = Object.assign(Object.create(TestDashboard.prototype) as TestDashboard, {
		dashBuilds: new Map(),
		broadcast: vi.fn(),
		ctx: {
			storage: {
				get: vi.fn(async (key: string | string[]) =>
					Array.isArray(key)
						? new Map(key.map((k) => [k, storage.get(k)]))
						: structuredClone(storage.get(key))
				),
				put: vi.fn(async (key: string | Record<string, unknown>, value: unknown) => {
					if (typeof key === 'string') storage.set(key, structuredClone(value));
					else for (const [k, v] of Object.entries(key)) storage.set(k, v);
				})
			}
		},
		who: async () => who,
		teams: async () => ({ teams: [] }),
		all: () => [],
		storedSubjectFacts: (keys: string[]) =>
			new Map(keys.flatMap((key) => (facts.has(key) ? [[key, facts.get(key)]] : []))),
		decideSubjects: async () => {},
		decisionsOf: () => new Map(),
		placeItems: (_who: Who, rows: DashItem[]) => rows,
		storeTracked: vi.fn(),
		storeTrackedBuild: trackedBuild,
		untrackMissing: vi.fn(),
		record: vi.fn(async () => ({ changed: 0 })),
		deliver: vi.fn(),
		run: vi.fn(),
		transaction: (action: () => void) => action()
	});
	vi.mocked(fetchDetails).mockImplementation(async (_token, _me, ids) => ({
		subjects: new Map(
			subjects.filter((subject) => ids.includes(subject.id)).map((subject) => [subject.id, subject])
		),
		errors: []
	}));
	return { poller, subjects, data, storage, trackedBuild };
}

const NOTHING_FOUND = {
	hits: [],
	errors: [],
	failedSections: new Set<string>(),
	failedQueries: []
};

const failEveryBoardQuery = () =>
	vi.mocked(boardShort).mockImplementation(async (_token, queries) => ({
		hits: [],
		errors: ['Board failed'],
		failedSections: new Set(queries.map((query) => query.section)),
		failedQueries: queries
	}));

describe('dashboard source failure and local filters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(boardShort).mockResolvedValue(NOTHING_FOUND);
		vi.mocked(searchShort).mockResolvedValue(NOTHING_FOUND);
		vi.mocked(itemStatuses).mockResolvedValue({ projects: [], statusOf: new Map(), errors: [] });
	});

	it('reads fresh facts when a successful source overlaps a failed source', async () => {
		const { poller, subjects, storage } = harness();
		storage.set('dash:read:pr', { 'sandbox/web#1': Date.now() });
		failEveryBoardQuery();
		vi.mocked(searchShort).mockResolvedValue({
			hits: [
				{
					id: 'PR_1',
					key: 'sandbox/web#1',
					updatedAt: new Date(Date.parse(subjects[0].updatedAt) + 1000).toISOString(),
					query: { section: 'mine', q: 'is:pr repo:sandbox/web' }
				}
			],
			errors: [],
			failedSections: new Set(),
			failedQueries: []
		});
		await poller.incrementalBuild();
		expect(fetchDetails).toHaveBeenCalledWith('test', 'reviewer', ['PR_1']);
	});

	it('retains a failed board source while removing confirmed absence from a successful source', async () => {
		const { poller, trackedBuild } = harness();
		failEveryBoardQuery();
		const result = await poller.build();
		expect(result.items.map((item) => [item.id, item.sections])).toEqual([
			['sandbox/web#1', ['website']]
		]);
		expect(result.sections.map((section) => section.count)).toEqual([1, 0]);
		expect(result.errors).toContain('Board failed');
		expect(trackedBuild).toHaveBeenCalledWith('pr', false);
	});

	it('removes old open items when every source confirms their absence', async () => {
		const { poller, trackedBuild } = harness();
		const result = await poller.build();
		expect(result.items).toEqual([]);
		expect(trackedBuild).toHaveBeenCalledWith('pr', true);
	});

	it('does not restore rows after repeated definitive board failures', async () => {
		const { poller } = harness();
		vi.mocked(boardShort).mockResolvedValue({
			hits: [],
			errors: ['Project not found'],
			failedSections: new Set(['website']),
			failedQueries: []
		});
		expect((await poller.build()).items).toEqual([]);
		expect((await poller.build()).items).toEqual([]);
	});

	it('stops carrying a failed source after one hour without a successful read', async () => {
		const { poller, data, storage } = harness();
		const failed = { section: 'website', q: 'project:sandbox/7 status:Todo' };
		data.sourceFailures = {
			[JSON.stringify([failed.section, failed.q, ''])]: Date.now() - 60 * 60_000
		};
		storage.set('dash:pr', { ...(storage.get('dash:pr') as object), data });
		vi.mocked(boardShort).mockResolvedValue({
			hits: [],
			errors: ['Board failed'],
			failedSections: new Set(['website']),
			failedQueries: [failed]
		});
		expect((await poller.build()).items).toEqual([]);
	});

	it('does not restore a successful query absence when another query in the view fails', async () => {
		const { poller, data, storage } = harness();
		const successful = { section: 'website', q: 'is:pr project:sandbox/7 status:Todo' };
		const failed = { section: 'website', q: 'is:pr project:sandbox/7 status:Done' };
		data.items[0].sourceQueries = [JSON.stringify([successful.section, successful.q, ''])];
		storage.set('dash:pr', { ...(storage.get('dash:pr') as object), data });
		vi.mocked(boardShort).mockResolvedValue({
			hits: [],
			errors: ['Board failed'],
			failedSections: new Set(['website']),
			failedQueries: [failed]
		});
		const result = await poller.build();
		expect(result.items).toEqual([]);
	});

	it('retains only the failed membership when a row previously belonged to two views', async () => {
		const { poller, data, storage } = harness();
		data.items[0].sections = ['website', 'mine'];
		storage.set('dash:pr', { ...(storage.get('dash:pr') as object), data });
		failEveryBoardQuery();
		const result = await poller.build();
		expect(result.items[0].sections).toEqual(['website']);
	});

	it('keeps the matched local filters on a hidden source row so later updates can restore it', async () => {
		const { poller, subjects } = harness();
		subjects[0].additions = 20;
		vi.mocked(searchShort).mockResolvedValue({
			hits: [
				{
					id: 'PR_1',
					key: 'sandbox/web#1',
					updatedAt: subjects[0].updatedAt,
					query: { section: 'mine', q: 'is:pr repo:sandbox/web', filter: 'size:<10' }
				}
			],
			errors: [],
			failedSections: new Set(),
			failedQueries: []
		});
		const result = await poller.build();
		expect(result.items).toEqual([]);
		expect(result.sourceItems?.[0].sourceFilters).toEqual({ mine: ['size:<10'] });
	});

	it('rebuilds a legacy snapshot without source metadata even while its TTL is fresh', async () => {
		const { poller } = harness();
		const result = await poller.cachedBuild();
		expect(searchShort).toHaveBeenCalled();
		expect(result.sourceItems).toBeDefined();
	});
});

describe('one dashboard build at a time', () => {
	function slowSearches() {
		const searches = { running: 0, mostAtOnce: 0, answers: [] as (() => void)[] };
		vi.mocked(searchShort).mockImplementation(
			() =>
				new Promise((resolve) => {
					searches.running++;
					searches.mostAtOnce = Math.max(searches.mostAtOnce, searches.running);
					searches.answers.push(() => {
						searches.running--;
						resolve(NOTHING_FOUND);
					});
				})
		);
		const answerNext = async () => {
			await vi.waitFor(() => expect(searches.answers.length).toBeGreaterThan(0));
			searches.answers.shift()!();
		};
		return { searches, answerNext };
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(boardShort).mockResolvedValue(NOTHING_FOUND);
		vi.mocked(itemStatuses).mockResolvedValue({ projects: [], statusOf: new Map(), errors: [] });
	});

	it('shares a running build with a background rebuild', async () => {
		const { poller } = harness();
		const { searches, answerNext } = slowSearches();
		const alarmRebuild = poller.incrementalBuild();
		const staleRefresh = poller.incrementalBuild();
		await answerNext();
		expect(await staleRefresh).toBe(await alarmRebuild);
		expect(searchShort).toHaveBeenCalledTimes(1);
		expect(searches.mostAtOnce).toBe(1);
	});

	it('runs the Refresh build after a background rebuild, not next to it', async () => {
		const { poller } = harness();
		const { searches, answerNext } = slowSearches();
		const alarmRebuild = poller.incrementalBuild();
		const refresh = poller.build();
		await answerNext();
		await alarmRebuild;
		await answerNext();
		await refresh;
		expect(searchShort).toHaveBeenCalledTimes(2);
		expect(searches.mostAtOnce).toBe(1);
	});

	it('lets a background rebuild share a running Refresh build', async () => {
		const { poller } = harness();
		const { answerNext } = slowSearches();
		const refresh = poller.build();
		const alarmRebuild = poller.incrementalBuild();
		await answerNext();
		await Promise.all([refresh, alarmRebuild]);
		expect(searchShort).toHaveBeenCalledTimes(1);
	});

	it('builds again after a board change that came during a build', async () => {
		const { poller } = harness();
		const { searches, answerNext } = slowSearches();
		const alarmRebuild = poller.incrementalBuild();
		await vi.waitFor(() => expect(searchShort).toHaveBeenCalledTimes(1));
		await new Promise((done) => setTimeout(done, 2));
		const afterBoardChange = poller.rebuildAfter(Date.now());
		await answerNext();
		await alarmRebuild;
		await answerNext();
		await afterBoardChange;
		expect(searchShort).toHaveBeenCalledTimes(2);
		expect(searches.mostAtOnce).toBe(1);
	});
});
