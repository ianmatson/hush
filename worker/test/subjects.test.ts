import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finishItem } from '../../src/lib/shared/dashboard';
import { groupItems } from '../../src/lib/shared/grouping';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import { dashFactsOf, type SubjectFacts } from '../../src/lib/shared/subject';
import type { DashResponse } from '../../src/lib/shared/types';
import type { Who } from '../poller/shared';

vi.mock('../poller/decisions', () => ({ PollerDecisions: class {} }));
vi.mock('../github', () => ({ fetchSubjects: vi.fn() }));
vi.mock('../projects', () => ({ itemStatuses: vi.fn() }));

const { PollerSubjects } = await import('../poller/subjects');
const { itemStatuses } = await import('../projects');
const { fetchSubjects } = await import('../github');

const now = new Date().toISOString();
const who: Who = {
	userId: 1,
	me: 'ian',
	token: 'test-token',
	settings: structuredClone(DEFAULT_SETTINGS),
	projectAccess: 'read'
};
const subject: SubjectFacts = {
	id: 'PR_1',
	kind: 'pr',
	repo: 'PostHog/posthog.com',
	number: 1,
	title: 'Fix it',
	url: 'https://github.com/PostHog/posthog.com/pull/1',
	author: 'alice',
	authorAvatar: null,
	authorIsBot: false,
	createdAt: now,
	updatedAt: now,
	state: 'open',
	draft: false,
	labels: [],
	assignees: [],
	comments: 0,
	lastComment: null,
	ci: 'SUCCESS',
	reviewDecision: 'APPROVED',
	mergeable: 'MERGEABLE',
	additions: 2,
	deletions: 1,
	lastCommitAt: now,
	reviewRequests: [],
	requestEvents: [],
	myReview: { at: now, state: 'APPROVED' },
	latestReview: { author: 'ian', at: now, state: 'APPROVED' },
	verdicts: [],
	openThreads: 0
};
const project = {
	key: 'PostHog/7',
	title: 'Website',
	url: 'https://github.com/orgs/PostHog/projects/7',
	statuses: [{ id: 'doing', name: 'In progress', color: 'YELLOW' }]
};

class TestSubjects extends PollerSubjects {
	patch(subjects: SubjectFacts[]) {
		return this.patchDashCaches(who, subjects);
	}
	recompute() {
		return this.rePlaceCachedItems(who);
	}
}

function harness() {
	const item = finishItem(
		dashFactsOf(subject, who.me, new Set()),
		['website'],
		['Website'],
		who.me,
		14
	);
	const data: DashResponse = {
		kind: 'pr',
		items: [{ ...item, projectStatus: { 'PostHog/7': 'doing' } }],
		projects: [project],
		sections: [{ id: 'website', name: 'Website', count: 1 }],
		teams: [],
		fetchedAt: Date.now(),
		errors: []
	};
	const cache = new Map([['dash:pr', { sig: 'test', data }]]);
	const broadcast = vi.fn();
	const poller = Object.assign(Object.create(TestSubjects.prototype) as TestSubjects, {
		ctx: {
			storage: {
				get: vi.fn(async (key: string) => structuredClone(cache.get(key))),
				put: vi.fn(async (key: string, value: { sig: string; data: DashResponse }) => {
					cache.set(key, value);
				})
			}
		},
		teams: vi.fn(async () => ({ teams: [] })),
		placeItems: vi.fn((_who: Who, items: DashResponse['items']) => items),
		storeTracked: vi.fn(),
		broadcast,
		who: vi.fn(async () => who),
		allIn: vi.fn(() => [{ key: item.id, facts: JSON.stringify(subject) }]),
		run: vi.fn(),
		transaction: vi.fn((action: () => void) => action()),
		decideSubjects: vi.fn(async () => {}),
		decisionsOf: vi.fn(() => new Map())
	});
	return { poller, cache, broadcast };
}

describe('subject dashboard updates', () => {
	beforeEach(() => {
		who.settings = structuredClone(DEFAULT_SETTINGS);
		vi.mocked(itemStatuses).mockResolvedValue({
			projects: [project],
			statusOf: new Map([['PR_1', { 'PostHog/7': 'doing' }]]),
			errors: []
		});
	});

	it('keeps an approved pull request in its project section', async () => {
		const { poller, cache } = harness();
		await poller.patch([subject]);
		const data = cache.get('dash:pr')!.data;
		expect(data.items[0].myLastReviewState).toBe('APPROVED');
		expect(
			groupItems(data.items, 'project:PostHog/7', {
				me: 'ian',
				categoryGroups: [],
				projects: data.projects
			}).map((section) => section.label)
		).toEqual(['In progress']);
	});

	it('preserves known membership and reports a failed project read', async () => {
		vi.mocked(itemStatuses).mockResolvedValue({
			projects: [],
			statusOf: new Map(),
			errors: ['GitHub returned 502.']
		});
		const { poller, cache } = harness();
		await poller.patch([subject]);
		expect(cache.get('dash:pr')!.data.items[0].projectStatus).toEqual({ 'PostHog/7': 'doing' });
		expect(cache.get('dash:pr')!.data.errors).toContain('GitHub returned 502.');
	});

	it('accepts a confirmed removal from the project', async () => {
		vi.mocked(itemStatuses).mockResolvedValue({
			projects: [],
			statusOf: new Map([['PR_1', {}]]),
			errors: []
		});
		const { poller, cache } = harness();
		await poller.patch([subject]);
		expect(cache.get('dash:pr')!.data.items[0].projectStatus).toEqual({});
	});

	it('refreshes project data when the subject facts are unchanged and tells clients to refetch', async () => {
		vi.mocked(itemStatuses).mockResolvedValue({
			projects: [{ ...project, statuses: [{ id: 'done', name: 'Done', color: 'GREEN' }] }],
			statusOf: new Map([['PR_1', { 'PostHog/7': 'done' }]]),
			errors: []
		});
		const { poller, cache, broadcast } = harness();
		await poller.recordFetched(subject);
		expect(cache.get('dash:pr')!.data.items[0].projectStatus).toEqual({ 'PostHog/7': 'done' });
		expect(cache.get('dash:pr')!.data.projects?.[0].statuses[0].name).toBe('Done');
		expect(broadcast).toHaveBeenCalledWith({ type: 'dash', kind: 'pr' });
	});

	it.each([
		['GitHub did not answer', { githubDidNotAnswer: new Set(['PostHog/posthog.com#1']) }, false],
		['the item is gone', { deletedOrNoAccess: new Set(['PostHog/posthog.com#1']) }, true]
	])('reports a recheck as done only when it read the item: %s', async (_, outcome, ok) => {
		const { poller } = harness();
		vi.mocked(fetchSubjects).mockResolvedValueOnce({
			subjects: new Map(),
			deletedOrNoAccess: new Set(),
			githubDidNotAnswer: new Set(),
			errors: ['GitHub returned 502.'],
			...outcome
		});
		expect(await poller.recheck('PostHog/posthog.com', 1)).toEqual(
			ok ? { ok: true } : { error: 'GitHub returned 502.' }
		);
	});

	it('keeps board-sourced bots when an approval clears their review request', async () => {
		who.settings.dash.hideBots = true;
		who.settings.views = [
			{
				id: 'website',
				name: 'Website',
				searches: ['project:PostHog/7 status:Todo'],
				groupBy: 'project:PostHog/7'
			}
		];
		const { poller, cache } = harness();
		await poller.patch([{ ...subject, author: 'dependabot[bot]', authorIsBot: true }]);
		expect(cache.get('dash:pr')!.data.items).toHaveLength(1);
	});

	it('removes filtered bots from search-sourced views', async () => {
		who.settings.dash.hideBots = true;
		const { poller, cache } = harness();
		await poller.patch([{ ...subject, author: 'dependabot[bot]', authorIsBot: true }]);
		expect(cache.get('dash:pr')!.data.items).toEqual([]);
		expect(cache.get('dash:pr')!.data.sections[0].count).toBe(0);
	});

	it('updates issue projects through the same path', async () => {
		const { poller, cache } = harness();
		const data = cache.get('dash:pr')!.data;
		data.kind = 'issue';
		data.items[0].kind = 'issue';
		cache.delete('dash:pr');
		cache.set('dash:issue', { sig: 'test', data });
		await poller.patch([{ ...subject, kind: 'issue' }]);
		expect(cache.get('dash:issue')!.data.items[0].projectStatus).toEqual({ 'PostHog/7': 'doing' });
	});

	it('recomputes decisions without reading GitHub and keeps project membership', async () => {
		const { poller, cache } = harness();
		Object.assign(poller, {
			teams: vi.fn(() => {
				throw new Error('GitHub team reads are forbidden during recompute');
			}),
			decisionsOf: () =>
				new Map([
					['PostHog/posthog.com#1', { commentsNeedMe: false, urgent: true, smart: [], choices: {} }]
				])
		});
		vi.mocked(itemStatuses).mockClear();
		await poller.recompute();
		expect(cache.get('dash:pr')!.data.items[0]).toMatchObject({
			urgent: true,
			commentsNeedMe: false,
			projectStatus: { 'PostHog/7': 'doing' }
		});
		expect(itemStatuses).not.toHaveBeenCalled();
	});

	it('removes only the local view that stopped matching and restores it when the item matches again', async () => {
		const { poller, cache } = harness();
		const data = cache.get('dash:pr')!.data;
		data.items[0].sections = ['small', 'all'];
		data.items[0].sourceFilters = { small: ['size:<10'], all: [''] };
		data.sections = [
			{ id: 'small', name: 'Small', count: 1 },
			{ id: 'all', name: 'All', count: 1 }
		];
		await poller.patch([{ ...subject, additions: 20 }]);
		expect(cache.get('dash:pr')!.data.items[0].sections).toEqual(['all']);
		expect(cache.get('dash:pr')!.data.sourceItems?.[0].sections).toEqual(['small', 'all']);
		await poller.patch([subject]);
		expect(cache.get('dash:pr')!.data.items[0].sections).toEqual(['small', 'all']);
	});

	it('computes turn from only the views that pass local filters', async () => {
		const { poller, cache } = harness();
		const data = cache.get('dash:pr')!.data;
		data.items[0].sections = ['small', 'all'];
		data.items[0].sourceFilters = { small: ['size:<10'], all: [''] };
		data.sections = [
			{ id: 'small', name: 'Small', count: 1 },
			{ id: 'all', name: 'All', count: 1 }
		];
		const updated = {
			...subject,
			additions: 20,
			reviewDecision: null,
			latestReview: null,
			myReview: null
		};
		await poller.patch([updated]);
		const expected = finishItem(
			dashFactsOf(updated, who.me, new Set()),
			['all'],
			['All'],
			who.me,
			14
		);
		const actual = cache.get('dash:pr')!.data.items[0];
		expect(actual.sections).toEqual(expected.sections);
		expect(actual.turnReason).toBe(expected.turnReason);
		expect(actual.priority).toBe(expected.priority);
		expect(actual.projectStatus).toEqual({ 'PostHog/7': 'doing' });
	});

	it('does not overwrite another item update or a new cache signature after a delayed project read', async () => {
		const { poller, cache } = harness();
		const data = cache.get('dash:pr')!.data;
		data.items.push({
			...data.items[0],
			id: 'PostHog/posthog.com#2',
			number: 2,
			title: 'Old second title'
		});
		let finish!: (value: Awaited<ReturnType<typeof itemStatuses>>) => void;
		const pending = new Promise<Awaited<ReturnType<typeof itemStatuses>>>((resolve) => {
			finish = resolve;
		});
		vi.mocked(itemStatuses).mockReturnValueOnce(pending);
		const first = poller.patch([{ ...subject, title: 'First update' }]);
		await vi.waitFor(() => expect(itemStatuses).toHaveBeenCalled());
		await poller.patch([{ ...subject, id: 'PR_2', number: 2, title: 'Second update' }]);
		cache.get('dash:pr')!.sig = 'new signature';
		finish({ projects: [], statusOf: new Map(), errors: [] });
		await first;
		expect(cache.get('dash:pr')!.sig).toBe('new signature');
		expect(cache.get('dash:pr')!.data.items.map((item) => item.title)).toEqual([
			'First update',
			'Second update'
		]);
	});

	it('keeps closed items only in their previously visible local views and restores raw memberships on reopen', async () => {
		const { poller, cache } = harness();
		const data = cache.get('dash:pr')!.data;
		data.items[0].sections = ['small', 'all'];
		data.items[0].sourceFilters = { small: ['size:<10'], all: [''] };
		await poller.patch([{ ...subject, additions: 20 }]);
		await poller.patch([{ ...subject, additions: 20, state: 'merged', closedAt: now }]);
		expect(cache.get('dash:pr')!.data.items[0]).toMatchObject({
			sections: ['all'],
			keptAfterClose: true
		});
		await poller.patch([subject]);
		expect(cache.get('dash:pr')!.data.items[0].sections).toEqual(['small', 'all']);
		expect(cache.get('dash:pr')!.data.items[0].keptAfterClose).toBeUndefined();
	});

	it('does not introduce a never-visible filtered item into the closed section', async () => {
		const { poller, cache } = harness();
		cache.get('dash:pr')!.data.items[0].sourceFilters = { website: ['size:<1'] };
		await poller.patch([subject]);
		expect(cache.get('dash:pr')!.data.items).toEqual([]);
		await poller.patch([{ ...subject, state: 'merged', closedAt: now }]);
		expect(cache.get('dash:pr')!.data.items).toEqual([]);
	});
});
