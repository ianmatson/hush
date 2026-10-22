import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotOf } from '../../src/lib/shared/changes';
import { HOUR_MS } from '../../src/lib/shared/durations';
import { STALE_SOURCE_LIMIT_MS } from '../../src/lib/model/sources';
import { createSavedViewAdapter, SAVED_VIEW_TOOL_DEFINITIONS } from '../assistant/adapter';
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

const numbers = (page: { groups: { items: { number: number }[] }[] }) =>
	page.groups.flatMap((g) => g.items.map((i) => i.number));

describe('passive saved views', () => {
	it('continues within a group and rejects a cursor for another saved view', async () => {
		const f = assistantFixture();
		f.settings.views = [
			{ ...VIEW, groupBy: 'none' },
			{ ...VIEW, id: 'second' }
		];
		f.saveSettings();
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

	it('returns categories and manual pins with display metadata', async () => {
		const f = assistantFixture();
		const group = f.settings.categoryGroups[0];
		const category = group.categories[0];
		f.updateItem('PR_1', (item) => (item.attention.pins = [category.id]));
		f.settings.views[0].groupBy = `category:${group.id}`;
		f.saveSettings();
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.categoryGroups[0]).toMatchObject({ id: group.id, name: group.name });
		expect(page.groups[0].items[0]).toMatchObject({
			number: 1,
			categories: [category.id],
			pinnedCategories: [category.id]
		});
		expect(page.groups[0].key).toBe(category.id);
	});

	it('evaluates event snoozes from stored facts and expires retained closed items locally', async () => {
		const f = assistantFixture();
		f.updateItem('PR_1', (item) => {
			item.facts.ci = 'FAILURE';
			item.attention.snooze = {
				kind: 'event',
				id: 'snooze-1',
				at: NOW - 100,
				event: 'ci_pass',
				until: NOW + 7 * 24 * HOUR_MS
			};
		});
		f.updateFacts('PR_2', {
			state: 'merged',
			closedAt: new Date(NOW - 24 * HOUR_MS).toISOString()
		});
		f.updateView('mine', (state) => (state.retained = ['PR_2']));
		expect(numbers(success(await f.tools.get_view({ view_id: 'mine' })))).toEqual([3]);
		f.updateFacts('PR_1', { ci: 'SUCCESS' });
		expect(numbers(success(await f.tools.get_view({ view_id: 'mine' })))).toEqual([1, 3]);
		const stored = f.db.prepare(`SELECT attention FROM items WHERE id = 'PR_1'`).get() as {
			attention: string;
		};
		expect(JSON.parse(stored.attention).snooze).toMatchObject({ event: 'ci_pass' });
		expect(f.writes).not.toHaveBeenCalled();
	});

	it('keeps a recently closed item that the view retains', async () => {
		const f = assistantFixture();
		f.updateFacts('PR_2', { state: 'merged', closedAt: new Date(NOW - HOUR_MS).toISOString() });
		f.updateView('mine', (state) => (state.retained = ['PR_2']));
		const page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(numbers(page)).toContain(2);
		const closed = page.groups.flatMap((g) => g.items).find((i) => i.number === 2)!;
		expect(closed).toMatchObject({ retained: true, retainedIn: ['mine'], views: [] });
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
		expect(result.freshness).toEqual({
			evaluatedAt: NOW,
			lastPollAt: null,
			polling: true,
			stale: false,
			unknown: false,
			truncated: false,
			errors: [],
			skipped: null
		});
		const item = result.groups[0].items[0];
		expect(item).toMatchObject({
			views: ['mine'],
			retainedIn: [],
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
		f.setNow(NOW + 1_000);
		const second = success(
			await f.tools.get_view({ view_id: 'mine', limit: 1, cursor: first.nextCursor! })
		);
		f.setNow(NOW + 2_000);
		const third = success(
			await f.tools.get_view({ view_id: 'mine', limit: 1, cursor: second.nextCursor! })
		);
		expect([first, second, third].flatMap(numbers)).toEqual([1, 2, 3]);
		expect(third.nextCursor).toBeNull();
		expect(
			await f.tools.get_view({ view_id: 'mine', kind: 'pr', cursor: first.nextCursor! })
		).toEqual({ ok: false, error: { code: 'snapshot_changed' } });
		const other = assistantFixture(2);
		expect(await other.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
		f.updateFacts('PR_1', { title: 'Changed' });
		expect(await f.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toEqual({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
	});

	it('rejects changed cursors after settings, marks, or seen snapshots change', async () => {
		const f = assistantFixture();
		const first = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		f.updateItem('PR_1', (item) => {
			item.attention.seen = {
				at: NOW,
				revision: item.revision,
				snapshot: snapshotOf(item.facts, 'reviewer')
			};
		});
		expect(await f.tools.get_view({ view_id: 'mine', cursor: first.nextCursor! })).toMatchObject({
			ok: false,
			error: { code: 'snapshot_changed' }
		});
		const marked = success(await f.tools.get_view({ view_id: 'mine', limit: 1 }));
		f.updateItem('I_3', (item) => (item.attention.markedUnread = true));
		expect(await f.tools.get_view({ view_id: 'mine', cursor: marked.nextCursor! })).toMatchObject({
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
		f.updateItem(
			'PR_1',
			(item) => (item.attention.snooze = { kind: 'time', id: 's1', at: NOW, until: NOW + 1000 })
		);
		f.updateItem('PR_2', (item) => (item.attention.muted = true));
		f.updateItem(
			'I_3',
			(item) =>
				(item.attention.snooze = {
					kind: 'activity',
					id: 's3',
					at: NOW,
					activityAt: item.facts.updatedAt
				})
		);
		expect(success(await f.tools.get_view({ view_id: 'mine' })).totalItems).toBe(0);
		f.setNow(NOW + 1001);
		expect(numbers(success(await f.tools.get_view({ view_id: 'mine' })))).toEqual([1]);
		f.updateFacts('I_3', { updatedAt: new Date(NOW + 2000).toISOString() });
		expect(success(await f.tools.get_view({ view_id: 'mine' })).totalItems).toBe(2);
		const stored = f.db.prepare('SELECT id, attention FROM items ORDER BY id').all() as {
			id: string;
			attention: string;
		}[];
		expect(
			stored.map((row) => {
				const attention = JSON.parse(row.attention);
				return [row.id, attention.snooze?.kind ?? null, attention.muted];
			})
		).toEqual([
			['I_3', 'activity', false],
			['PR_1', 'time', false],
			['PR_2', null, true],
			['PR_4', null, false]
		]);
		expect(f.writes).not.toHaveBeenCalled();
	});

	it('distinguishes stale, unknown, truncated, skipped, and empty sources', async () => {
		const f = assistantFixture();
		f.settings.views[0].searches = [...VIEW.searches, 'is:pr team-review-requested:@team'];
		f.saveSettings();
		f.updateSource('pr', (source) => {
			source.failedSince = NOW;
			source.error = 'GitHub search failed';
		});
		let page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.complete).toBe(false);
		expect(page.freshness).toMatchObject({
			stale: true,
			unknown: false,
			errors: ['GitHub search failed'],
			skipped: 'You are not in any tracked team.'
		});
		expect(page.totalItems).toBe(3);
		f.setNow(NOW + STALE_SOURCE_LIMIT_MS);
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.freshness).toMatchObject({
			unknown: true,
			evaluatedAt: NOW + STALE_SOURCE_LIMIT_MS
		});
		expect(page.totalItems).toBe(1);
		f.setNow(NOW);
		f.settings.views[0].searches = ['is:issue repo:other/repo'];
		f.saveSettings({ searched: false });
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.freshness).toMatchObject({ unknown: true, stale: false, skipped: null });
		expect(page.complete).toBe(false);
		expect(page.totalItems).toBe(0);
		f.settings.views[0].searches = VIEW.searches;
		f.saveSettings();
		f.updateSource('issue', (source) => (source.window = { candidates: [], truncated: true }));
		f.updateSource('pr', (source) => {
			source.window = { candidates: [], truncated: false };
			source.failedSince = null;
			source.error = null;
		});
		page = success(await f.tools.get_view({ view_id: 'mine' }));
		expect(page.freshness).toMatchObject({ truncated: true, stale: false, unknown: false });
		expect(page.groups).toEqual([]);
		expect(page.complete).toBe(true);
		expect(page.nextCursor).toBeNull();
	});

	it('reads seen changes without marking read or touching any state, network, or alarm', async () => {
		const f = assistantFixture();
		f.updateItem('PR_1', (item) => {
			item.attention.seen = {
				at: NOW - 1,
				revision: item.revision,
				snapshot: snapshotOf({ ...item.facts, comments: 0 }, 'reviewer')
			};
			item.facts.comments = 2;
		});
		f.values.set('mcpAccessVersion', 'epoch');
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
		expect(f.storage.getAlarm).not.toHaveBeenCalled();
		expect(network).not.toHaveBeenCalled();
		expect(f.queries.length).toBeGreaterThan(0);
		expect(f.queries.every((q) => q.startsWith('SELECT '))).toBe(true);
	});

	it('fails closed for another user or an unready workspace without migration or writes', async () => {
		const f = assistantFixture();
		await expect(
			f.workspace.savedViewsSnapshot({ userId: 2, login: 'other' })
		).rejects.toMatchObject({ code: 'scope_mismatch' });
		f.db.exec(`DELETE FROM state WHERE key = 'config'`);
		await expect(f.reader()).rejects.toMatchObject({ code: 'schema_not_ready' });
		f.db.exec('DROP TABLE items');
		await expect(f.reader()).rejects.toMatchObject({ code: 'schema_not_ready' });
		f.db.exec('DROP TABLE state');
		await expect(f.reader()).rejects.toMatchObject({ code: 'scope_mismatch' });
		expect(f.queries.every((q) => q.startsWith('SELECT '))).toBe(true);
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
		expect(f.reader).not.toHaveBeenCalled();
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
		expect(f.reader).not.toHaveBeenCalled();
		const response = await call('get_view', { view_id: 'mine', limit: 1 });
		expect(response.isError).toBe(false);
		expect(JSON.parse(response.content[0].text)).toEqual(response.structuredContent);
	});
});
