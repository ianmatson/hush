import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintView, type SavedViewGrant } from '../assistant/grant';
import { createSavedViewTools } from '../assistant/tools';
import type { Env } from '../db';
import { assistantFixture, NOW, VIEW } from './assistant-fixtures';

vi.mock('cloudflare:workers', () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: Env
		) {}
	}
}));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function success<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
	if (!result.ok) throw new Error(JSON.stringify(result.error));
	return result.data;
}

async function fixture() {
	const f = assistantFixture();
	f.settings.views.push({
		...VIEW,
		id: 'private-view',
		name: 'Excluded view',
		searches: ['repo:secret/repo']
	});
	f.saveSettings();
	const grant: SavedViewGrant = {
		id: 'grant-one',
		userId: 1,
		views: [{ id: VIEW.id, fingerprint: await fingerprintView(f.settings.views[0]) }]
	};
	return { ...f, grant, tools: createSavedViewTools(() => f.reader(), grant) };
}

describe('saved view grants', () => {
	it('lists only granted definitions and denies missing and ungranted views alike', async () => {
		const f = await fixture();
		const page = success(await f.tools.list_views());
		expect(page.total).toBe(1);
		expect(page.views.map((view) => view.id)).toEqual(['mine']);
		for (const view_id of ['private-view', 'missing'])
			expect(await f.tools.get_view({ view_id })).toEqual({
				ok: false,
				error: { code: 'view_not_found' }
			});
		expect(JSON.stringify(page)).not.toContain('secret/repo');
	});

	it.each(['searches', 'groupBy', 'sections', 'keepClosed'] as const)(
		'fails closed after %s changes',
		async (field) => {
			const f = await fixture();
			Object.assign(f.settings.views[0], {
				[field]: {
					searches: ['repo:another/repo'],
					groupBy: 'project:secret/7',
					sections: [{ name: 'New section', rule: 'is:pr' }],
					keepClosed: false
				}[field]
			});
			f.saveSettings();
			expect(success(await f.tools.list_views()).views).toEqual([]);
			expect(await f.tools.get_view({ view_id: 'mine' })).toEqual({
				ok: false,
				error: { code: 'view_not_found' }
			});
		}
	);

	it('fails closed after deletion or removal from the current capability', async () => {
		const f = await fixture();
		f.settings.views = f.settings.views.filter((view) => view.id !== 'mine');
		f.saveSettings();
		expect(success(await f.tools.list_views()).total).toBe(0);
		const removed = await fixture();
		removed.grant.views = [];
		expect(success(await removed.tools.list_views()).total).toBe(0);
		expect(await removed.tools.get_view({ view_id: 'mine' })).toEqual({
			ok: false,
			error: { code: 'view_not_found' }
		});
	});

	it('denies a capability from another account', async () => {
		const f = await fixture();
		const tools = createSavedViewTools(() => f.reader(), { ...f.grant, userId: 2 });
		expect(await tools.list_views()).toEqual({
			ok: false,
			error: { code: 'snapshot_unavailable' }
		});
		expect(await tools.get_view({ view_id: 'mine' })).toEqual({
			ok: false,
			error: { code: 'snapshot_unavailable' }
		});
	});

	it('binds cursors to the grant identity and its effective view scope', async () => {
		const f = await fixture();
		const first = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		const otherGrant = createSavedViewTools(() => f.reader(), { ...f.grant, id: 'grant-two' });
		expect(await otherGrant.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
		f.grant.views.push({
			id: 'private-view',
			fingerprint: await fingerprintView(f.settings.views[1])
		});
		expect(await f.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
	});

	it('scrubs membership, unselected category and project data, stacks, errors, and unknown fields', async () => {
		const f = await fixture();
		f.settings.categoryGroups.push({
			id: 'excluded-group',
			name: 'Excluded group',
			categories: [
				{
					id: 'excluded-category',
					name: 'Excluded category',
					color: 'gray',
					icon: 'lucide:box',
					rule: '',
					description: ''
				}
			]
		});
		f.settings.views[1].searches.push('is:pr team-review-requested:@team');
		f.config.projects = [
			{
				key: 'secret/7',
				title: 'Excluded project',
				url: 'https://example.test/secret',
				statuses: []
			}
		];
		f.saveSettings();
		const link = (id: string) => {
			const { number, title, url, author, draft } = f.items.get(id)!.facts;
			return { number, title, url, author, draft };
		};
		f.updateItem('PR_1', (item) => {
			item.attention.pins = ['excluded-category'];
			item.project = { state: 'known', statuses: { 'secret/7': 'Excluded status' }, stale: false };
			item.facts.stackBelowNearestFirst = [link('PR_2'), link('PR_4')];
			item.facts.labels = [
				{ name: 'safe', color: 'fff', futureSecret: 'excluded-label-field' } as never
			];
		});
		f.updateFacts('PR_2', { state: 'merged', closedAt: new Date(NOW).toISOString() });
		f.updateView('mine', (state) => (state.retained = ['PR_2']));
		f.updateView('private-view', (state) => (state.retained = ['PR_2']));
		f.updateSource('pr', (source) => {
			source.failedSince = NOW;
			source.error = 'secret/repo search failed';
		});
		const read = async () => {
			const snapshot = await f.reader();
			Object.assign(
				snapshot.items.rows.find((row) => row.itemId === 'PR_1')!,
				{
					futureSecret: 'excluded-field'
				}
			);
			return snapshot;
		};
		const ungranted = await read();
		expect(ungranted.items.rows.find((row) => row.itemId === 'PR_1')).toMatchObject({
			views: ['mine', 'private-view'],
			categories: ['excluded-category'],
			projectStatus: { 'secret/7': 'Excluded status' }
		});
		expect(ungranted.items.rows.find((row) => row.itemId === 'PR_2')).toMatchObject({
			views: ['private-view'],
			retainedIn: ['mine']
		});
		const tools = createSavedViewTools(read, f.grant);
		const page = success(await tools.get_view({ view_id: 'mine' }));
		const items = page.groups.flatMap((group) => group.items);
		const item = items.find((item) => item.itemId === 'PR_1')!;
		expect(item.views).toEqual(['mine']);
		expect(item.retainedIn).toEqual([]);
		expect(items.find((item) => item.itemId === 'PR_2')).toMatchObject({
			views: [],
			retainedIn: ['mine']
		});
		expect(item.categories).toEqual([]);
		expect(item.pinnedCategories).toEqual([]);
		expect(item.projectStatus).toBeUndefined();
		expect(item.projectStatusUnknown).toBeUndefined();
		expect(item.stackBelowNearestFirst?.map((link) => link.number)).toEqual([2]);
		expect(page.categoryGroups).toEqual([]);
		expect(page.totalItems).toBe(3);
		expect(page.freshness).toMatchObject({ stale: true, errors: [], skipped: null });
		expect(page.complete).toBe(false);
		const serialized = JSON.stringify(page);
		for (const secret of [
			'private-view',
			'excluded-category',
			'secret/7',
			'secret/repo',
			'tracked team',
			'futureSecret',
			'sourceFilters',
			'sourceQueries'
		])
			expect(serialized).not.toContain(secret);
	});

	it('returns only the grouping category display fields and its pins', async () => {
		const f = await fixture();
		const [group, other] = f.settings.categoryGroups;
		const category = group.categories[0];
		f.settings.views[0].groupBy = `category:${group.id}`;
		f.grant.views[0].fingerprint = await fingerprintView(f.settings.views[0]);
		f.updateItem('PR_1', (item) => (item.attention.pins = [category.id, other.categories[0].id]));
		category.rule = 'repo:excluded/rules';
		category.description = 'Excluded description';
		f.saveSettings();
		const ungranted = await f.reader();
		expect(ungranted.items.rows.find((row) => row.itemId === 'PR_1')?.pinnedCategories).toEqual([
			category.id,
			other.categories[0].id
		]);
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.categoryGroups.map((group) => group.id)).toEqual([group.id]);
		expect(page.groups[0].items[0].categories).toEqual([category.id]);
		expect(page.groups[0].items[0].pinnedCategories).toEqual([category.id]);
		expect(JSON.stringify(page)).not.toContain('excluded/rules');
		expect(JSON.stringify(page)).not.toContain('Excluded description');
	});

	it('preserves custom grouping rules internally without returning their definitions', async () => {
		const f = await fixture();
		f.settings.views[0].groupBy = 'custom';
		f.settings.views[0].sections = [{ name: 'Authored', rule: 'author:reviewer' }];
		f.grant.views[0].fingerprint = await fingerprintView(f.settings.views[0]);
		f.saveSettings();
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.groups[0].label).toBe('Authored');
		expect(page.groups[0].items.map((item) => item.number)).toEqual([1]);
		expect(page.view.sections).toEqual([{ name: 'Authored' }]);
		expect(JSON.stringify(page)).not.toContain('author:reviewer');
	});

	it('keeps fingerprints stable across object key order and changes them for broadened searches', async () => {
		expect(await fingerprintView(VIEW)).toBe(
			await fingerprintView({
				groupBy: VIEW.groupBy,
				searches: VIEW.searches,
				name: VIEW.name,
				id: VIEW.id
			})
		);
		expect(await fingerprintView(VIEW)).not.toBe(
			await fingerprintView({ ...VIEW, searches: ['is:open'] })
		);
	});
});
