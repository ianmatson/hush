import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../db';
import { SCHEMA_VERSION } from '../poller/schema';
import { assistantFixture } from './assistant-fixtures';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { Settings } from '../../src/lib/shared/types';

vi.mock('cloudflare:workers', () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: Env
		) {}
	}
}));

const { ActivePoller, Poller } = await import('../poller');

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('passive poller RPC lifecycle', () => {
	function passive() {
		const f = assistantFixture();
		const forbidden = vi.fn(() => {
			throw new Error('Unexpected active lifecycle');
		});
		const state = {
			storage: f.storage,
			blockConcurrencyWhile: forbidden,
			setWebSocketAutoResponse: forbidden,
			getWebSockets: forbidden,
			waitUntil: forbidden
		} as unknown as DurableObjectState;
		const network = vi.fn(() => {
			throw new Error('Unexpected network');
		});
		vi.stubGlobal('fetch', network);
		f.db.exec('PRAGMA query_only = ON');
		const before = JSON.stringify([...f.values]);
		const changes = f.db.prepare('SELECT total_changes() AS n').get();
		return { ...f, forbidden, network, before, changes, poller: new Poller(state, {} as Env) };
	}

	it('constructs cold and reads through the POLLER RPC without initialization, writes, alarms, or network', async () => {
		const f = passive();
		const first = await f.poller.savedViewsSnapshot({ userId: 1, login: 'reviewer' });
		const second = await f.poller.savedViewsSnapshot({ userId: 1, login: 'reviewer' });
		expect(first).toEqual(second);
		expect(first.views.map((view) => view.id)).toEqual(['mine']);
		expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(f.changes);
		expect(JSON.stringify([...f.values])).toBe(f.before);
		expect(f.writes).not.toHaveBeenCalled();
		expect(f.forbidden).not.toHaveBeenCalled();
		expect(f.network).not.toHaveBeenCalled();
		for (const method of [
			'engine',
			'active',
			'activate',
			'migrate',
			'who',
			'settings',
			'saveSettings'
		])
			expect(method in f.poller).toBe(false);
	});

	it.each([undefined, 0, 2, SCHEMA_VERSION - 1, SCHEMA_VERSION + 1])(
		'refuses cold schema %s without running migrations',
		async (schema) => {
			const f = passive();
			f.values.set('schema', schema);
			await expect(
				f.poller.savedViewsSnapshot({ userId: 1, login: 'reviewer' })
			).rejects.toMatchObject({ code: 'schema_not_ready' });
			expect(f.queries).toEqual([]);
			expect(f.writes).not.toHaveBeenCalled();
			expect(f.forbidden).not.toHaveBeenCalled();
			expect(f.network).not.toHaveBeenCalled();
		}
	);

	it('rejects another principal before SQL without changing its own scope for the next call', async () => {
		const f = passive();
		await expect(f.poller.savedViewsSnapshot({ userId: 2, login: 'other' })).rejects.toMatchObject({
			code: 'scope_mismatch'
		});
		expect(f.queries).toEqual([]);
		expect((await f.poller.savedViewsSnapshot({ userId: 1, login: 'reviewer' })).principal).toEqual(
			{ userId: 1, login: 'reviewer' }
		);
		expect(f.forbidden).not.toHaveBeenCalled();
		expect(f.writes).not.toHaveBeenCalled();
	});
});

function activeHarness() {
	const values = new Map<string, unknown>();
	const db = new DatabaseSync(':memory:');
	const sql = vi.fn((query: string, ...args: (string | number | null)[]) => {
		if (!args.length && !query.trimStart().startsWith('SELECT')) {
			db.exec(query);
			return { rowsWritten: 0, toArray: () => [] };
		}
		return { rowsWritten: 0, toArray: () => db.prepare(query).all(...args) };
	});
	const put = vi.fn(async (key: string | Record<string, unknown>, value?: unknown) => {
		if (typeof key === 'string') values.set(key, value);
		else for (const [entry, value] of Object.entries(key)) values.set(entry, value);
	});
	const state = {
		storage: {
			get: async (key: string | string[]) =>
				Array.isArray(key) ? new Map(key.map((key) => [key, values.get(key)])) : values.get(key),
			put,
			delete: async (key: string | string[]) => {
				for (const entry of typeof key === 'string' ? [key] : key) values.delete(entry);
			},
			deleteAll: vi.fn(async () => {
				values.clear();
				const tables = db
					.prepare(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
					)
					.all() as { name: string }[];
				for (const { name } of tables) db.exec(`DROP TABLE "${name}"`);
			}),
			deleteAlarm: vi.fn(async () => {}),
			setAlarm: vi.fn(async () => {}),
			sql: { exec: sql },
			transactionSync: <T>(run: () => T) => {
				db.exec('BEGIN');
				try {
					const result = run();
					db.exec('COMMIT');
					return result;
				} catch (error) {
					db.exec('ROLLBACK');
					throw error;
				}
			}
		},
		blockConcurrencyWhile: vi.fn(async <T>(run: () => Promise<T>) => run()),
		setWebSocketAutoResponse: vi.fn(),
		getWebSockets: () => []
	};
	vi.stubGlobal('WebSocketRequestResponsePair', class {});
	const poller = new Poller(state as unknown as DurableObjectState, {} as Env);
	return { poller, values, state, db, put, sql };
}

describe('active poller lifecycle', () => {
	it('stores settings and access-version invalidation in one write, including delete and recreation', async () => {
		class SettingsWriter extends ActivePoller {
			persist(settings: Settings) {
				return this.saveSettings(settings);
			}
		}
		const f = activeHarness();
		const writer = new SettingsWriter(f.state as unknown as DurableObjectState, {} as Env);
		await writer.persist(structuredClone(DEFAULT_SETTINGS));
		const initial = f.values.get('mcpAccessVersion');
		await writer.persist({ ...structuredClone(DEFAULT_SETTINGS), views: [] });
		const deleted = f.values.get('mcpAccessVersion');
		await writer.persist(structuredClone(DEFAULT_SETTINGS));
		const recreated = f.values.get('mcpAccessVersion');
		expect(new Set([initial, deleted, recreated]).size).toBe(3);
		expect(f.put).toHaveBeenCalledTimes(3);
		for (const call of f.put.mock.calls)
			expect(call[0]).toEqual({
				settings: expect.any(String),
				mcpAccessVersion: expect.any(String)
			});
		const before = JSON.stringify([...f.values]);
		f.put.mockRejectedValueOnce(new Error('Synthetic write failure'));
		await expect(
			writer.persist({ ...structuredClone(DEFAULT_SETTINGS), views: [] })
		).rejects.toThrow('Synthetic write failure');
		expect(JSON.stringify([...f.values])).toBe(before);
	});

	it('initializes before concurrent UI RPCs, once per active lifecycle', async () => {
		const f = activeHarness();
		const mark = vi.spyOn(ActivePoller.prototype, 'markSeen').mockImplementation(async () => {
			expect(f.values.get('schema')).toBe(SCHEMA_VERSION);
			expect(f.db.prepare('SELECT count(*) AS n FROM seen').get()).toMatchObject({ n: 0 });
			return { ok: true };
		});
		await Promise.all([f.poller.markSeen([]), f.poller.markSeen([])]);
		expect(mark).toHaveBeenCalledTimes(2);
		expect(f.state.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
		expect(f.state.setWebSocketAutoResponse).toHaveBeenCalledTimes(1);
	});

	it('preserves initialization before start and after stop removes the schema', async () => {
		const f = activeHarness();
		await f.poller.start(1);
		const firstAccessVersion = f.values.get('mcpAccessVersion');
		expect(firstAccessVersion).toEqual(expect.any(String));
		expect(f.values.get('userId')).toBe(1);
		expect(f.values.get('schema')).toBe(SCHEMA_VERSION);
		expect(f.state.storage.setAlarm).toHaveBeenCalledTimes(1);
		await f.poller.stop();
		expect(f.values.size).toBe(0);
		await f.poller.start(1);
		expect(f.values.get('mcpAccessVersion')).not.toBe(firstAccessVersion);
		expect(f.values.get('schema')).toBe(SCHEMA_VERSION);
		expect(f.state.blockConcurrencyWhile).toHaveBeenCalledTimes(2);
		expect(f.db.prepare('SELECT count(*) AS n FROM subjects').get()).toMatchObject({ n: 0 });
	});

	it('does not run an active RPC on migration failure and retries initialization on the next call', async () => {
		const f = activeHarness();
		const mark = vi.spyOn(ActivePoller.prototype, 'markSeen').mockResolvedValue({ ok: true });
		f.sql.mockImplementationOnce(() => {
			throw new Error('Synthetic migration failure');
		});
		await expect(f.poller.markSeen([])).rejects.toThrow('Synthetic migration failure');
		expect(mark).not.toHaveBeenCalled();
		expect(f.values.has('schema')).toBe(false);
		await f.poller.markSeen([]);
		expect(mark).toHaveBeenCalledTimes(1);
		expect(f.values.get('schema')).toBe(SCHEMA_VERSION);
	});

	it('initializes before synchronous SQL reads, alarms, and socket events', async () => {
		const f = activeHarness();
		const ready = () => {
			expect(f.values.get('schema')).toBe(SCHEMA_VERSION);
		};
		const alerts = vi.spyOn(ActivePoller.prototype, 'alerts').mockImplementation(() => {
			ready();
			return [];
		});
		const alarm = vi.spyOn(ActivePoller.prototype, 'alarm').mockImplementation(async () => {
			ready();
		});
		const socket = vi
			.spyOn(ActivePoller.prototype, 'webSocketError')
			.mockImplementation(async () => {
				ready();
			});
		expect(await f.poller.alerts()).toEqual([]);
		await f.poller.alarm();
		await f.poller.webSocketError({} as WebSocket);
		expect(alerts).toHaveBeenCalledTimes(1);
		expect(alarm).toHaveBeenCalledTimes(1);
		expect(socket).toHaveBeenCalledTimes(1);
	});
});
