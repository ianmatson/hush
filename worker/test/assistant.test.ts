import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotOf } from '../../src/lib/shared/changes';
import { MUTED_AT } from '../../src/lib/shared/item-snooze';
import { createSavedViewAdapter, SAVED_VIEW_TOOL_DEFINITIONS } from '../assistant/adapter';
import { createSnapshotReader } from '../assistant/snapshot';
import { createSavedViewTools } from '../assistant/tools';
import { DASH_TTL } from '../poller/shared';
import { assistantFixture, NOW, VIEW } from './assistant-fixtures';

afterEach(() => vi.unstubAllGlobals());

function success<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
	if (!result.ok) throw new Error(JSON.stringify(result.error));
	return result.data;
}

describe('passive saved views', () => {
	it('continues within a group and rejects a cursor for another saved view', async () => {
		const f = assistantFixture();
		f.settings.views = [
			{ ...VIEW, groupBy: 'none' },
			{ ...VIEW, id: 'second' }
		];
		f.saveSettings();
		for (const data of [f.pr, f.issue]) for (const item of data.items) item.sections.push('second');
		const first = success(await f.tools.get_view({ view_id: 'mine', limit: 2 }));
		const next = success(
			await f.tools.get_view({ view_id: 'mine', limit: 2, cursor: first.nextCursor! })
		);
		expect(first.groups[0].totalItems).toBe(3);
		expect(next.groups[0].totalItems).toBe(3);
		expect(next.groups[0].items).toHaveLength(1);
		expect(
			new Set([...first.groups[0].items, ...next.groups[0].items].map((item) => item.id)).size
		).toBe(3);
		expect(await f.tools.get_view({ view_id: 'second', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
	});

	it('returns cached categories and manual pins with display metadata', async () => {
		const f = assistantFixture();
		const group = f.settings.categoryGroups[0];
		const category = group.categories[0];
		f.pr.items[0].categories = [category.id];
		f.pr.items[0].pinnedCategories = [category.id];
		f.settings.views[0].groupBy = `category:${group.id}`;
		f.saveSettings();
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.categoryGroups[0]).toMatchObject({ id: group.id, name: group.name });
		expect(page.groups[0].items[0]).toMatchObject({
			categories: [category.id],
			pinnedCategories: [category.id]
		});
		expect(page.groups[0].key).toBe(category.id);
	});

	it('evaluates event snoozes from stored facts and expires retained closed items locally', async () => {
		const f = assistantFixture();
		f.subjects[0].ci = 'FAILURE';
		f.db
			.prepare('UPDATE subjects SET facts = ? WHERE key = ?')
			.run(JSON.stringify(f.subjects[0]), f.items[0].id);
		f.db
			.prepare(
				'INSERT INTO dash_snoozed (item_id, updated_at, snooze_event, snoozed_at) VALUES (?, ?, ?, ?)'
			)
			.run(f.items[0].id, f.items[0].updatedAt, 'ci_pass', NOW - 100);
		const closed = f.pr.items[1];
		closed.keptAfterClose = true;
		closed.state = 'merged';
		closed.closedAt = new Date(NOW - 24 * 3600_000).toISOString();
		expect(
			success(await f.tools.get_view({ view_id: 'mine' })).groups.flatMap((g) =>
				g.items.map((i) => i.number)
			)
		).toEqual([3]);
		f.subjects[0].ci = 'SUCCESS';
		f.db
			.prepare('UPDATE subjects SET facts = ? WHERE key = ?')
			.run(JSON.stringify(f.subjects[0]), f.items[0].id);
		expect(
			success(await f.tools.get_view({ view_id: 'mine' })).groups.flatMap((g) =>
				g.items.map((i) => i.number)
			)
		).toEqual([1, 3]);
		expect(f.db.prepare('SELECT count(*) AS n FROM dash_snoozed').get()).toMatchObject({ n: 1 });
	});

	it('rejects a kind that is not supported by the saved searches', async () => {
		const f = assistantFixture();
		f.settings.views[0].searches = ['is:pr repo:sandbox/web'];
		f.saveSettings();
		expect(await f.tools.get_view({ view_id: 'mine', kind: 'issue' })).toEqual({
			ok: false,
			error: { code: 'invalid_arguments' }
		});
	});

	it('returns exact saved membership and role order with Hush facts and no source bookkeeping', async () => {
		const { tools } = assistantFixture();
		const result = success(await tools.get_view({ view_id: 'mine' }));
		expect(result.groups.map((g) => [g.key, g.items.map((i) => i.number)])).toEqual([
			['opened', [1]],
			['reviews', [2]],
			['assigned', [3]]
		]);
		expect(result.totalItems).toBe(3);
		expect(result.complete).toBe(true);
		expect(result.freshness.map((f) => f.state)).toEqual(['fresh', 'fresh']);
		const item = result.groups[0].items[0];
		expect(item).toMatchObject({
			turn: expect.any(String),
			turnReason: expect.any(String),
			priority: expect.any(Number),
			waitingSince: expect.any(String),
			stale: expect.any(Boolean),
			unread: true,
			changes: [],
			seenAt: null
		});
		expect(item).not.toHaveProperty('sourceFilters');
		expect(item).not.toHaveProperty('sourceQueries');
	});

	it('preserves view order and paginates view definitions', async () => {
		const f = assistantFixture();
		f.settings.views = [VIEW, { ...VIEW, id: 'second', name: 'Second' }];
		f.saveSettings();
		const first = success(await f.tools.list_views({ limit: 1 }));
		const second = success(await f.tools.list_views({ limit: 1, cursor: first.nextCursor! }));
		expect(first.views.map((v) => v.id)).toEqual(['mine']);
		expect(second.views.map((v) => v.id)).toEqual(['second']);
		expect(second.nextCursor).toBeNull();
	});

	it('paginates grouped rows without omission and binds cursors to scope, view, and kind', async () => {
		const f = assistantFixture();
		const first = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		const second = success(
			await f.tools.get_view({ view_id: 'mine', limit: 1, cursor: first.nextCursor! })
		);
		const third = success(
			await f.tools.get_view({ view_id: 'mine', limit: 1, cursor: second.nextCursor! })
		);
		expect(
			[first, second, third].flatMap((page) =>
				page.groups.flatMap((g) => g.items.map((i) => i.number))
			)
		).toEqual([1, 2, 3]);
		expect(third.nextCursor).toBeNull();
		expect(
			await f.tools.get_view({ view_id: 'mine', kind: 'pr', cursor: first.nextCursor! })
		).toEqual({ ok: false, error: { code: 'snapshot_changed' } });
		const other = assistantFixture(2);
		expect(await other.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
		f.pr.items[0].title = 'Changed';
		expect(await f.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
	});

	it('rejects changed cursors after settings, marks, or seen snapshots change', async () => {
		const f = assistantFixture();
		const first = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		f.db
			.prepare('INSERT INTO seen (key, at, snapshot) VALUES (?, ?, ?)')
			.run(f.items[0].id, NOW, JSON.stringify(snapshotOf(f.subjects[0], 'reviewer')));
		expect(await f.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toMatchObject({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
		const next = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		f.settings.views[0].sort = { by: 'title', dir: 'asc', turnFirst: false };
		f.saveSettings();
		expect(await f.tools.get_view({ view_id: 'mine', cursor: next.nextCursor! })).toMatchObject({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
	});

	it('hides snoozes and mutes and wakes timed and activity snoozes without writing', async () => {
		const f = assistantFixture();
		const insert = f.db.prepare(
			'INSERT INTO dash_snoozed (item_id, updated_at, snoozed_until) VALUES (?, ?, ?)'
		);
		insert.run(f.items[0].id, f.items[0].updatedAt, NOW + 1000);
		insert.run(f.items[1].id, MUTED_AT, null);
		insert.run(f.items[2].id, f.items[2].updatedAt, null);
		expect(success(await f.tools.get_view({ view_id: 'mine' })).totalItems).toBe(0);
		f.setNow(NOW + 1001);
		expect(
			success(await f.tools.get_view({ view_id: 'mine' })).groups.flatMap((g) =>
				g.items.map((i) => i.number)
			)
		).toEqual([1]);
		f.issue.items[0].updatedAt = new Date(NOW + 2000).toISOString();
		expect(success(await f.tools.get_view({ view_id: 'mine' })).totalItems).toBe(2);
		expect(f.db.prepare('SELECT count(*) AS n FROM dash_snoozed').get()).toMatchObject({ n: 3 });
	});

	it('distinguishes stale, missing, incompatible, partial, and empty caches', async () => {
		const f = assistantFixture();
		f.pr.errors = ['GitHub search failed'];
		f.pr.sections[0].skipped = 'No tracked teams';
		f.setNow(NOW + DASH_TTL);
		let page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.complete).toBe(false);
		expect(page.freshness[0]).toMatchObject({
			state: 'stale',
			errors: ['GitHub search failed'],
			skipped: 'No tracked teams'
		});
		f.values.delete('dash:pr');
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.freshness[0]).toMatchObject({ state: 'missing', fetchedAt: null });
		expect(page.totalItems).toBe(1);
		f.settings.views[0].searches = ['is:issue repo:other/repo'];
		f.values.set('settings', JSON.stringify(f.settings));
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.freshness[0].state).toBe('settings_changed');
		expect(page.totalItems).toBe(0);
		f.saveSettings();
		f.issue.items = [];
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.groups).toEqual([]);
		expect(page.complete).toBe(true);
		expect(page.nextCursor).toBeNull();
	});

	it('reads seen changes without marking read or touching any state, network, or alarm', async () => {
		const f = assistantFixture();
		const old = { ...f.subjects[0], comments: 0 };
		f.db
			.prepare('INSERT INTO seen (key, at, snapshot) VALUES (?, ?, ?)')
			.run(f.items[0].id, NOW - 1, JSON.stringify(snapshotOf(old, 'reviewer')));
		f.subjects[0].comments = 2;
		f.db
			.prepare('UPDATE subjects SET facts = ? WHERE key = ?')
			.run(JSON.stringify(f.subjects[0]), f.items[0].id);
		const before = JSON.stringify([...f.values]);
		const changes = f.db.prepare('SELECT total_changes() AS n').get();
		const network = vi.fn(() => {
			throw new Error('Unexpected network');
		});
		vi.stubGlobal('fetch', network);
		f.db.exec('PRAGMA query_only = ON');
		const first = success(await f.tools.get_view({ view_id: 'mine' }));
		const again = success(await f.tools.get_view({ view_id: 'mine' }));
		await f.tools.list_views();
		expect(first).toEqual(again);
		expect(first.groups[0].items[0]).toMatchObject({ seenAt: NOW - 1, unread: true });
		expect(first.groups[0].items[0].changes?.length).toBeGreaterThan(0);
		expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
		expect(JSON.stringify([...f.values])).toBe(before);
		expect(f.writes).not.toHaveBeenCalled();
		expect(network).not.toHaveBeenCalled();
		expect(f.queries.every((q) => q.startsWith('SELECT '))).toBe(true);
	});

	it('fails closed for another user or schema without migration, SQL, or writes', async () => {
		const f = assistantFixture();
		const other = createSnapshotReader(f.storage, { userId: 2, login: 'other' });
		await expect(other(NOW)).rejects.toMatchObject({ code: 'scope_mismatch' });
		f.values.set('schema', 0);
		await expect(f.reader(NOW)).rejects.toMatchObject({ code: 'schema_not_ready' });
		expect(f.queries).toEqual([]);
		expect(f.writes).not.toHaveBeenCalled();
		expect(await f.tools.list_views()).toEqual({
			ok: false,
			error: { code: 'snapshot_unavailable' }
		});
	});

	it.each([0, -1, 101, 1.5, Infinity, NaN])('rejects invalid page size %s', async (limit) => {
		const f = assistantFixture();
		expect(await f.tools.list_views({ limit })).toEqual({
			ok: false,
			error: { code: 'invalid_arguments' }
		});
		expect(f.storage.get).not.toHaveBeenCalled();
	});

	it('returns bounded errors for invalid cursors, unknown views, and storage failures', async () => {
		const f = assistantFixture();
		for (const cursor of ['', 'wrong', 'x'.repeat(1025), btoa('{}'), btoa('null')])
			expect(await f.tools.get_view({ view_id: 'mine', cursor })).toEqual({
				ok: false,
				error: { code: 'invalid_cursor' }
			});
		expect(await f.tools.get_view({ view_id: 'unknown' })).toEqual({
			ok: false,
			error: { code: 'view_not_found' }
		});
		const broken = createSavedViewTools(async () => {
			throw new Error('secret storage details');
		});
		expect(await broken.list_views()).toEqual({
			ok: false,
			error: { code: 'snapshot_unavailable' }
		});
	});
});

describe('transport-free MCP adapter', () => {
	it('only registers the two read-only tools and rejects proxy or identity arguments before reads', async () => {
		const f = assistantFixture();
		const call = createSavedViewAdapter(f.tools);
		expect(
			SAVED_VIEW_TOOL_DEFINITIONS.map((tool) => [tool.name, tool.annotations.readOnlyHint])
		).toEqual([
			['list_views', true],
			['get_view', true]
		]);
		for (const [name, args] of [
			['proxy', {}],
			['list_views', { userId: 2 }],
			['get_view', { view_id: 'mine', refresh: true }],
			['get_view', null],
			['list_views', { limit: null }]
		])
			expect((await call(name as string, args)).isError).toBe(true);
		expect(f.storage.get).not.toHaveBeenCalled();
		const response = await call('get_view', { view_id: 'mine', limit: 1 });
		expect(response.isError).toBe(false);
		expect(JSON.parse(response.content[0].text)).toEqual(response.structuredContent);
	});
});
