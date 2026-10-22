import { describe, expect, it } from 'vitest';
import { fingerprintView, type SavedViewGrant } from '../assistant/grant';
import { createSavedViewTools } from '../assistant/tools';
import { assistantFixture, NOW, VIEW } from './assistant-fixtures';

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
	return { ...f, grant, tools: createSavedViewTools(() => f.reader(NOW), grant) };
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
		const tools = createSavedViewTools(() => f.reader(NOW), { ...f.grant, userId: 2 });
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
		const otherGrant = createSavedViewTools(() => f.reader(NOW), { ...f.grant, id: 'grant-two' });
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

	it('scrubs membership, unselected category and project data, stacks, errors, counts, and unknown fields', async () => {
		const f = await fixture();
		const allowed = f.pr.items[0];
		const otherAllowed = f.pr.items[1];
		const excluded = f.pr.items[2];
		otherAllowed.url = 'https://github.com/sandbox/web/pull/2';
		excluded.url = 'https://github.com/sandbox/web/pull/4';
		allowed.sections.push('private-view');
		allowed.keptSections = ['mine', 'private-view'];
		allowed.categories = ['excluded-category'];
		allowed.pinnedCategories = ['excluded-category'];
		allowed.projectStatus = { 'secret/7': 'Excluded status' };
		allowed.projectStatusUnknown = true;
		allowed.stackBelowNearestFirst = [otherAllowed, excluded].map((member) => ({
			number: member.number,
			title: member.title,
			url: member.url,
			author: member.author,
			draft: member.draft
		}));
		Object.assign(allowed, { futureSecret: 'excluded-field' });
		Object.assign(allowed.labels[0] ?? (allowed.labels[0] = { name: 'safe', color: 'fff' }), {
			futureSecret: 'excluded-label-field'
		});
		f.pr.errors = ['secret/repo search failed'];
		f.pr.sections.push({
			id: 'private-view',
			name: 'Excluded view',
			count: 1234,
			skipped: 'Excluded skip'
		});
		f.pr.projects = [
			{
				key: 'secret/7',
				title: 'Excluded project',
				url: 'https://example.test/secret',
				statuses: []
			}
		];
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		const item = page.groups
			.flatMap((group) => group.items)
			.find((item) => item.id === allowed.id)!;
		expect(item.sections).toEqual(['mine']);
		expect(item.keptSections).toEqual(['mine']);
		expect(item.categories).toEqual([]);
		expect(item.pinnedCategories).toEqual([]);
		expect(item.projectStatus).toBeUndefined();
		expect(item.projectStatusUnknown).toBeUndefined();
		expect(item.stackBelowNearestFirst?.map((link) => link.number)).toEqual([2]);
		expect(page.categoryGroups).toEqual([]);
		expect(page.totalItems).toBe(3);
		expect(page.freshness[0].errors).toEqual([]);
		expect(page.complete).toBe(false);
		const serialized = JSON.stringify(page);
		for (const secret of [
			'private-view',
			'excluded-category',
			'secret/7',
			'secret/repo',
			'1234',
			'futureSecret',
			'sourceFilters',
			'sourceQueries'
		])
			expect(serialized).not.toContain(secret);
	});

	it('returns only the grouping category display fields and its pins', async () => {
		const f = await fixture();
		const group = f.settings.categoryGroups[0];
		const category = group.categories[0];
		f.settings.views[0].groupBy = `category:${group.id}`;
		f.grant.views[0].fingerprint = await fingerprintView(f.settings.views[0]);
		f.pr.items[0].categories = [category.id, 'excluded-category'];
		f.pr.items[0].pinnedCategories = [category.id, 'excluded-category'];
		category.rule = 'repo:excluded/rules';
		category.description = 'Excluded description';
		f.saveSettings();
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
