import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings';
import type { Settings } from '../../src/lib/shared/types';
import { MUTED_AT } from '../../src/lib/shared/item-snooze';

vi.mock('../poller/subjects', () => ({ PollerSubjects: class {} }));

const { PollerSync } = await import('../poller/sync');
const { SCHEMA } = await import('../poller/schema');

class TestSync extends PollerSync {
	protected async rebuildTracked() {}
	clean() {
		return this.cleanup();
	}
}

const KNOWN = 'o/r#1';
const TRACKED = 'o/r#2';
const GONE = 'o/r#9';
const GONE_MUTED = 'o/r#10';
const GONE_SNOOZED_LATER = 'o/r#11';
const GONE_SNOOZE_OVER = 'o/r#12';
const DAY_MS = 86_400_000;

function harness() {
	const db = new DatabaseSync(':memory:');
	db.exec(SCHEMA);
	const now = Date.now();
	db.prepare('INSERT INTO subjects (key, facts, changed_at) VALUES (?, ?, ?)').run(
		KNOWN,
		'{}',
		now
	);
	db.prepare('INSERT INTO tracked_items (key, kind, seen_at) VALUES (?, ?, ?)').run(
		TRACKED,
		'pr',
		now
	);
	for (const key of [KNOWN, TRACKED, GONE]) {
		db.prepare('INSERT INTO seen (key, at, snapshot) VALUES (?, ?, ?)').run(key, now, '{}');
		db.prepare('INSERT INTO dash_snoozed (item_id, updated_at) VALUES (?, ?)').run(
			key,
			'2026-01-01T00:00:00Z'
		);
		db.prepare('INSERT INTO item_pins (key, pinned) VALUES (?, ?)').run(key, '[]');
	}
	const insertMark = db.prepare(
		'INSERT INTO dash_snoozed (item_id, updated_at, snoozed_until) VALUES (?, ?, ?)'
	);
	insertMark.run(GONE_MUTED, MUTED_AT, null);
	insertMark.run(GONE_SNOOZED_LATER, '2026-01-01T00:00:00Z', now + DAY_MS);
	insertMark.run(GONE_SNOOZE_OVER, '2026-01-01T00:00:00Z', now - DAY_MS);
	for (const [view, item] of [
		['mine', KNOWN],
		['mine', GONE],
		['deleted', KNOWN]
	])
		db.prepare(
			'INSERT INTO view_items (view_id, kind, item_id, first_seen_at) VALUES (?, ?, ?, ?)'
		).run(view, 'pr', item, now);
	const values = new Map<string, unknown>([
		['viewItemsFor:mine:pr', '["is:pr"]'],
		['viewItemsFor:deleted:pr', '["is:pr"]'],
		['viewItemsFor:deleted:issue', '["is:issue"]'],
		['settings', 'kept']
	]);
	const settings: Settings = {
		...structuredClone(DEFAULT_SETTINGS),
		views: [{ id: 'mine', name: 'Mine', searches: ['is:pr'], groupBy: 'role' }]
	};
	const poller = Object.assign(Object.create(TestSync.prototype) as TestSync, {
		ctx: {
			storage: {
				get: async (key: string) => values.get(key),
				put: async (key: string, value: unknown) => {
					values.set(key, value);
				},
				list: async ({ prefix }: { prefix: string }) =>
					new Map([...values].filter(([key]) => key.startsWith(prefix))),
				delete: async (keys: string[]) => {
					for (const key of keys) values.delete(key);
				}
			}
		},
		settings: async () => settings,
		forgetOldPushMarks: () => {},
		run: (query: string, ...args: (string | number | null)[]) =>
			Number(db.prepare(query).run(...args).changes)
	});
	const keysIn = (table: string, column = 'key') =>
		(db.prepare(`SELECT ${column} AS key FROM ${table} ORDER BY 1`).all() as { key: string }[]).map(
			(row) => row.key
		);
	const viewItems = () =>
		db.prepare('SELECT view_id, item_id FROM view_items ORDER BY 1, 2').all() as {
			view_id: string;
			item_id: string;
		}[];
	return { poller, values, keysIn, viewItems };
}

describe('cleanup', () => {
	it('forgets the marks of items Hush no longer knows, and keeps those of known items', async () => {
		const { poller, keysIn } = harness();
		await poller.clean();
		expect(keysIn('seen')).toEqual([KNOWN, TRACKED]);
		expect(keysIn('dash_snoozed', 'item_id')).toEqual(
			[KNOWN, GONE_MUTED, GONE_SNOOZED_LATER, TRACKED].sort()
		);
	});

	it('keeps mutes, snoozes that have not ended, and category pins of items that are gone', async () => {
		const { poller, keysIn } = harness();
		await poller.clean();
		expect(keysIn('dash_snoozed', 'item_id')).toContain(GONE_MUTED);
		expect(keysIn('dash_snoozed', 'item_id')).toContain(GONE_SNOOZED_LATER);
		expect(keysIn('dash_snoozed', 'item_id')).not.toContain(GONE_SNOOZE_OVER);
		expect(keysIn('item_pins')).toEqual([KNOWN, TRACKED, GONE]);
	});

	it('forgets what deleted views found, and their remembered searches', async () => {
		const { poller, values, viewItems } = harness();
		await poller.clean();
		expect(viewItems()).toEqual([{ view_id: 'mine', item_id: KNOWN }]);
		expect([...values.keys()].filter((key) => key.startsWith('viewItemsFor:'))).toEqual([
			'viewItemsFor:mine:pr'
		]);
		expect(values.get('settings')).toBe('kept');
	});
});
