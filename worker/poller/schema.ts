/**
 * Each user's own SQLite database, in their Durable Object. One user per database, so no table
 * has a user id. Indexes cost a row write each, so there are only the ones the queries need.
 * Settings and the list version are Durable Object values (ctx.storage.kv), not tables.
 */
// Schema 2 was the "lanes" layout (reverted and wiped; see migrate()).
export const SCHEMA_VERSION = 19;
const DECISIONS_TABLE = `CREATE TABLE IF NOT EXISTS decisions (key TEXT PRIMARY KEY, answers TEXT NOT NULL, at INTEGER NOT NULL);`;
const ITEM_PINS_TABLE = `CREATE TABLE IF NOT EXISTS item_pins (key TEXT PRIMARY KEY, pinned TEXT NOT NULL DEFAULT '[]');`;
const VIEW_ITEMS_TABLE = `CREATE TABLE IF NOT EXISTS view_items (view_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL, first_seen_at INTEGER NOT NULL, PRIMARY KEY (view_id, kind, item_id));`;
const TRACKED_ITEMS_TABLE = `CREATE TABLE IF NOT EXISTS tracked_items (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL);`;
const NOTIFICATIONS_TABLE = `CREATE TABLE notifications (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, seen_at INTEGER NOT NULL);`;
export const SCHEMA = `
-- The one record of each PR or issue's facts (SubjectFacts JSON), for every view.
CREATE TABLE subjects (
  key TEXT PRIMARY KEY,
  facts TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

-- Alerts Hush pushed (the bell), for 30 days.
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  item_key TEXT
);

CREATE TABLE push_devices (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE dash_snoozed (item_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, snoozed_until INTEGER, snooze_event TEXT, snoozed_at INTEGER);

-- "Since you looked": each PR or issue's facts when you last looked at it (shared/changes.ts).
CREATE TABLE seen (key TEXT PRIMARY KEY, at INTEGER NOT NULL, snapshot TEXT NOT NULL);

CREATE TABLE push_marks (key TEXT PRIMARY KEY, pushed_at INTEGER NOT NULL, reason TEXT NOT NULL);

${DECISIONS_TABLE}

${ITEM_PINS_TABLE}

${TRACKED_ITEMS_TABLE}

${VIEW_ITEMS_TABLE}

${NOTIFICATIONS_TABLE}
`;

/** How to get from an older version of this layout to SCHEMA_VERSION. */
export const MIGRATIONS: Record<number, { to: number; sql: string; resetKeys?: string[] }> = {
	// Dashboard marks move from GitHub node ids to "owner/repo#123" (they start again), and threads
	// get the "only this one" override.
	1: {
		to: 3,
		sql: `
DELETE FROM dash_hidden;
ALTER TABLE threads ADD COLUMN override TEXT;
ALTER TABLE threads ADD COLUMN override_updated_at TEXT;`,
		// The cached dashboards have the old ids.
		resetKeys: ['dash:pr', 'dash:issue']
	},
	3: {
		to: 4,
		sql: `CREATE TABLE seen (key TEXT PRIMARY KEY, at INTEGER NOT NULL, snapshot TEXT NOT NULL);`
	},
	// The subject's API address, for the peek of releases, commits, and discussions. The last
	// 14 days are read again once (quietly, as a first sync), to fill it.
	4: {
		to: 5,
		sql: `ALTER TABLE threads ADD COLUMN api_url TEXT;`,
		resetKeys: ['lastModified', 'initialized']
	},
	// No more "✓ Done" pushes that replace an alert: Hush no longer keeps when it pushed.
	5: { to: 6, sql: `ALTER TABLE threads DROP COLUMN pushed_at;` },
	6: {
		to: 7,
		sql: `CREATE TABLE push_marks (key TEXT PRIMARY KEY, pushed_at INTEGER NOT NULL, reason TEXT NOT NULL);`
	},
	7: {
		to: 8,
		sql: `
CREATE TABLE IF NOT EXISTS push_marks (key TEXT PRIMARY KEY, pushed_at INTEGER NOT NULL, reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS threads_triage ON threads (triage, resolved_at);`
	},
	8: { to: 9, sql: DECISIONS_TABLE },
	9: { to: 11, sql: '' },
	10: { to: 11, sql: 'DROP TABLE IF EXISTS item_pins;' },
	11: { to: 12, sql: ITEM_PINS_TABLE },
	12: {
		to: 13,
		sql: `CREATE TABLE IF NOT EXISTS tracked_items (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL, category TEXT, tags TEXT NOT NULL DEFAULT '[]');`,
		resetKeys: ['dash:pr', 'dash:issue', 'lastWatch', 'lastCleanup']
	},
	13: {
		to: 14,
		sql: `
DROP TABLE IF EXISTS item_pins;
${ITEM_PINS_TABLE}
CREATE TABLE IF NOT EXISTS tracked_items_next (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL, categories TEXT NOT NULL DEFAULT '[]');
INSERT INTO tracked_items_next (key, kind, seen_at) SELECT key, kind, seen_at FROM tracked_items;
DROP TABLE tracked_items;
ALTER TABLE tracked_items_next RENAME TO tracked_items;`,
		resetKeys: ['dash:pr', 'dash:issue']
	},
	14: {
		to: 15,
		sql: `
DROP TABLE IF EXISTS item_pins;
${ITEM_PINS_TABLE}`,
		resetKeys: ['dash:pr', 'dash:issue']
	},
	15: {
		to: 16,
		sql: `
DROP TABLE IF EXISTS dash_moves;
DROP TABLE IF EXISTS dash_order;`,
		resetKeys: ['dash:pr', 'dash:issue']
	},
	16: {
		to: 17,
		sql: `
ALTER TABLE dash_hidden RENAME TO dash_snoozed;
ALTER TABLE dash_snoozed ADD COLUMN snoozed_until INTEGER;
ALTER TABLE dash_snoozed ADD COLUMN snooze_event TEXT;
ALTER TABLE dash_snoozed ADD COLUMN snoozed_at INTEGER;`
	},
	17: { to: 18, sql: VIEW_ITEMS_TABLE },
	18: {
		to: 19,
		sql: `
${NOTIFICATIONS_TABLE}
INSERT INTO notifications (id, updated_at, seen_at) SELECT id, gh_updated_at, first_seen_at FROM threads;
ALTER TABLE alerts ADD COLUMN item_key TEXT;
UPDATE alerts SET item_key = (SELECT subject_key FROM threads WHERE threads.id = alerts.thread_id);
ALTER TABLE alerts DROP COLUMN thread_id;
DROP TABLE threads;
ALTER TABLE tracked_items DROP COLUMN categories;`,
		resetKeys: ['threadsVersion', 'lastWatch', 'watchCursor', 'lastInboxCheck', 'onboarded']
	}
};
