import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SCHEMA, SCHEMA_VERSION } from '../poller/schema';

const SCHEMA_18 = `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,               -- GitHub notification thread id
  repo TEXT NOT NULL,
  subject_type TEXT NOT NULL,        -- PullRequest, Issue, CheckSuite, Release, ...
  subject_key TEXT,                  -- "owner/repo#123" for PRs and issues: see subjects
  title TEXT NOT NULL,
  html_url TEXT NOT NULL,
  reason TEXT NOT NULL,
  unread INTEGER NOT NULL,
  gh_updated_at TEXT NOT NULL,
  category TEXT NOT NULL,            -- action | fyi | muted
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  why TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_url TEXT NOT NULL,
  rule TEXT,
  triage TEXT NOT NULL,              -- inbox | done | snoozed
  snoozed_until INTEGER,
  snooze_event TEXT,
  snoozed_at INTEGER,
  resolved_at INTEGER,               -- set when Hush moved it to Done by itself
  resolved_note TEXT,
  marked_unread_at INTEGER,
  pushed_updated_at TEXT,            -- gh_updated_at of the last push for it
  first_seen_at INTEGER NOT NULL,
  override TEXT,                     -- "fyi": you said it does not need you ("only this one")…
  override_updated_at TEXT,          -- …until it changes (gh_updated_at moves past this)
  api_url TEXT                       -- GitHub's API address of the subject (the peek of releases…)
);
CREATE INDEX threads_view ON threads (category, triage);
CREATE INDEX threads_subject ON threads (subject_key);
CREATE INDEX threads_triage ON threads (triage, resolved_at);

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
  thread_id TEXT
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

CREATE TABLE IF NOT EXISTS decisions (key TEXT PRIMARY KEY, answers TEXT NOT NULL, at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS item_pins (key TEXT PRIMARY KEY, pinned TEXT NOT NULL DEFAULT '[]');

CREATE TABLE IF NOT EXISTS tracked_items (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL, categories TEXT NOT NULL DEFAULT '[]');

CREATE TABLE IF NOT EXISTS view_items (view_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL, first_seen_at INTEGER NOT NULL, PRIMARY KEY (view_id, kind, item_id));
`;

describe('schema migrations', () => {
	// The tables of a new account and of a migrated one must be the same.
	const columns = (sql: string[]) => {
		// node:sqlite is in Node 22+; the Worker runs the same SQL on Durable Object SQLite.
		const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
		const db = new DatabaseSync(':memory:');
		for (const s of sql) db.exec(s);
		const tables = db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
			.all() as { name: string }[];
		const indexes = db
			.prepare(
				`SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name`
			)
			.all() as { sql: string }[];
		return {
			tables: Object.fromEntries(
				tables.map(({ name }) => [
					name,
					(db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name)
				])
			),
			indexes: indexes.map((i) => i.sql)
		};
	};

	const beforeItemSnoozes = (sql: string) =>
		sql.replace(
			/CREATE TABLE dash_snoozed[^\n]*/,
			'CREATE TABLE dash_hidden (item_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL);'
		);

	it('schema 1 plus its steps equals a new schema', () => {
		// Schema 1 is the current one without what the steps add.
		const v1 = beforeItemSnoozes(SCHEMA_18)
			.replace(
				/,\n\s*override TEXT[^\n]*\n\s*override_updated_at TEXT[^\n]*\n\s*api_url TEXT[^\n]*/,
				''
			)
			.replace(/\n-- "Since you looked"[^\n]*\nCREATE TABLE seen[^\n]*\n/, '\n')
			.replace(/\nCREATE TABLE push_marks[^\n]*\n/, '\n')
			// Schema 1 still had pushed_at (a later step drops it).
			.replace(/(\n\s*pushed_updated_at TEXT,[^\n]*)/, '$1\n  pushed_at INTEGER,')
			.replace(/\nCREATE INDEX threads_triage[^\n]*/, '');
		expect(v1).toContain('pushed_at INTEGER');
		expect(v1).not.toContain('override');
		expect(v1).not.toContain('CREATE TABLE seen');
		expect(v1).not.toContain('threads_triage');
		const steps: string[] = [];
		for (let v = 1; v < 18; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([v1, ...steps])).toEqual(columns([SCHEMA_18]));
	});

	it.each([
		['push_marks but no threads_triage', /\nCREATE INDEX threads_triage[^\n]*/],
		['threads_triage but no push_marks', /\nCREATE TABLE push_marks[^\n]*/]
	])('either schema 7 (%s) plus its steps equals a new schema', (_, missing) => {
		const v7 = beforeItemSnoozes(SCHEMA_18).replace(missing, '');
		expect(v7).not.toEqual(SCHEMA);
		const steps: string[] = [];
		for (let v = 7; v < 18; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([v7, ...steps])).toEqual(columns([SCHEMA_18]));
	});

	const withoutItemPins = beforeItemSnoozes(SCHEMA_18).replace(
		/\nCREATE TABLE IF NOT EXISTS item_pins[^\n]*/,
		''
	);

	it.each([
		[9, withoutItemPins],
		[10, beforeItemSnoozes(SCHEMA_18)],
		[11, withoutItemPins]
	])('schema %i plus its steps equals a new schema', (from, start) => {
		const steps: string[] = [];
		for (let v = from; v < 18; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([start, ...steps])).toEqual(columns([SCHEMA_18]));
	});

	it('schema 18 plus its step equals a new schema, and keeps notifications and alert links', () => {
		const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
		const db = new DatabaseSync(':memory:');
		db.exec(SCHEMA_18);
		db.exec(`INSERT INTO threads (id, repo, subject_type, subject_key, title, html_url, reason, unread,
      gh_updated_at, category, kind, summary, why, action_label, action_url, triage, first_seen_at)
      VALUES ('t1', 'acme/web', 'PullRequest', 'acme/web#7', 'Fix', 'u', 'mention', 1,
      '2026-10-01T00:00:00Z', 'action', 'reply', 's', 'w', 'Open', 'u', 'inbox', 5)`);
		db.exec(
			`INSERT INTO alerts (sent_at, title, body, url, thread_id) VALUES (1, 'a', 'b', 'u', 't1')`
		);
		db.exec(MIGRATIONS[18].sql);
		expect(db.prepare('SELECT id, updated_at, seen_at FROM notifications').all()).toEqual([
			{ id: 't1', updated_at: '2026-10-01T00:00:00Z', seen_at: 5 }
		]);
		expect(db.prepare('SELECT item_key FROM alerts').all()).toEqual([{ item_key: 'acme/web#7' }]);
		expect(MIGRATIONS[18].to).toBe(SCHEMA_VERSION);
		expect(columns([SCHEMA_18, MIGRATIONS[18].sql])).toEqual(columns([SCHEMA]));
	});

	it('runs no empty step into the current schema', () => {
		expect(MIGRATIONS[SCHEMA_VERSION - 1]?.sql.trim()).toBeTruthy();
	});
});
