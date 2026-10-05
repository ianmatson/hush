import { describe, expect, it } from 'vitest';
import {
	MIGRATIONS,
	SCHEMA,
	SCHEMA_VERSION,
	THREADS,
	subjectRefOf,
	toDTO,
	viewWhere,
	WATCHED,
	type ThreadWithFacts
} from '../poller/schema';

describe('viewWhere', () => {
	// SQLite refuses a statement whose bind values do not match its placeholders.
	it.each(['action', 'fyi', 'inbox', 'snoozed', 'done', 'muted', 'all'])(
		'"%s" binds one value for each placeholder',
		(view) => {
			const { where, args } = viewWhere(view, 123);
			expect(where.split('?').length - 1).toBe(args.length);
			expect(args.every((a) => a === 123)).toBe(true);
		}
	);
});

describe('subject keys on threads', () => {
	it('reads owner, repo, and number from the key', () => {
		expect(subjectRefOf({ id: 't', subject_key: 'acme/website#20481' })).toEqual({
			key: 't',
			owner: 'acme',
			repo: 'website',
			number: 20481
		});
		expect(subjectRefOf({ id: 't', subject_key: null })).toBeNull();
	});

	const row = (over: Partial<ThreadWithFacts> = {}): ThreadWithFacts => ({
		id: 't',
		repo: 'o/r',
		subject_type: 'PullRequest',
		subject_key: 'o/r#7',
		title: 'T',
		html_url: 'https://github.com/o/r/pull/7',
		reason: 'review_requested',
		unread: 1,
		gh_updated_at: '2026-09-01T00:00:00Z',
		category: 'action',
		kind: 'review',
		summary: 's',
		why: 'w',
		action_label: 'Review',
		action_url: 'u',
		rule: null,
		triage: 'inbox',
		snoozed_until: null,
		snooze_event: null,
		snoozed_at: null,
		resolved_at: null,
		resolved_note: null,
		marked_unread_at: null,
		pushed_updated_at: null,
		first_seen_at: 0,
		facts: null,
		...over
	});

	it('a thread shows its number before its subject is read, and its facts after', () => {
		expect(toDTO(row())).toMatchObject({ number: 7, state: null, labels: [] });
		const facts = JSON.stringify({
			state: 'merged',
			draft: false,
			ci: 'SUCCESS',
			author: 'alice',
			authorIsBot: false,
			labels: [{ name: 'website', color: 'fff' }]
		});
		expect(toDTO(row({ facts }))).toMatchObject({
			number: 7,
			state: 'merged',
			ci: 'SUCCESS',
			author: 'alice',
			labels: ['website']
		});
	});
});

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

	it('schema 1 plus its steps equals a new schema', () => {
		// Schema 1 is the current one without what the steps add.
		const v1 = SCHEMA.replace(
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
		for (let v = 1; v < SCHEMA_VERSION; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([v1, ...steps])).toEqual(columns([SCHEMA]));
	});

	it.each([
		['push_marks but no threads_triage', /\nCREATE INDEX threads_triage[^\n]*/],
		['threads_triage but no push_marks', /\nCREATE TABLE push_marks[^\n]*/]
	])('either schema 7 (%s) plus its steps equals a new schema', (_, missing) => {
		const v7 = SCHEMA.replace(missing, '');
		expect(v7).not.toEqual(SCHEMA);
		const steps: string[] = [];
		for (let v = 7; v < SCHEMA_VERSION; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([v7, ...steps])).toEqual(columns([SCHEMA]));
	});

	const withoutItemPins = SCHEMA.replace(/\nCREATE TABLE IF NOT EXISTS item_pins[^\n]*/, '');

	it.each([
		[9, withoutItemPins],
		[10, SCHEMA],
		[11, withoutItemPins]
	])('schema %i plus its steps equals a new schema', (from, start) => {
		const steps: string[] = [];
		for (let v = from; v < SCHEMA_VERSION; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([start, ...steps])).toEqual(columns([SCHEMA]));
	});

	it('runs no empty step into the current schema', () => {
		expect(MIGRATIONS[SCHEMA_VERSION - 1]?.sql.trim()).toBeTruthy();
	});
});

describe('queries that run on every poll or watch', () => {
	const plan = (query: string, ...args: (string | number)[]) => {
		const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
		const db = new DatabaseSync(':memory:');
		db.exec(SCHEMA);
		return (db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...args) as { detail: string }[]).map(
			(r) => r.detail
		);
	};
	const readsEveryThread = (details: string[]) => details.some((d) => /^SCAN threads\b/.test(d));

	it('reads threads with their facts, decisions, and pinned category by thread columns', () => {
		const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
		const db = new DatabaseSync(':memory:');
		db.exec(SCHEMA);
		db.exec(`INSERT INTO item_pins (key, category) VALUES ('o/r#1', 'bugs')`);
		db.exec(`INSERT INTO threads (id, repo, subject_type, subject_key, title, html_url, reason, unread,
		  gh_updated_at, category, kind, summary, why, action_label, action_url, triage, first_seen_at)
		  VALUES ('t1', 'o/r', 'Issue', 'o/r#1', 'T', 'u', 'mention', 1, 'x', 'fyi', 'none', '', '', '', '', 'inbox', 0)`);
		const rows = db.prepare(`${THREADS} WHERE category != 'muted' AND triage = 'inbox'`).all() as {
			id: string;
			pin_category: string | null;
		}[];
		expect(rows).toEqual([expect.objectContaining({ id: 't1', pin_category: 'bugs' })]);
	});

	it.each([
		[
			'snoozes that are due',
			`SELECT id FROM threads WHERE triage = 'snoozed' AND snoozed_until <= ?`,
			[1]
		],
		[
			'the oldest open thread',
			`SELECT MIN(gh_updated_at) FROM threads WHERE triage IN ('inbox', 'snoozed')`,
			[]
		],
		[
			'open threads since a time',
			`SELECT id FROM threads WHERE triage IN ('inbox', 'snoozed') AND gh_updated_at >= ?`,
			['2026-01-01']
		],
		[
			'watched threads',
			`SELECT id FROM threads WHERE ${WATCHED} AND id > ? ORDER BY id LIMIT ?`,
			[1, '', 80]
		]
	] as const)('%s do not read every thread', (_, query, args) => {
		expect(readsEveryThread(plan(query, ...args))).toBe(false);
	});
});
