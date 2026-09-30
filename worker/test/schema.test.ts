import { describe, expect, it } from 'vitest';
import {
	MIGRATIONS,
	SCHEMA,
	SCHEMA_VERSION,
	subjectRefOf,
	toDTO,
	viewWhere,
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
		return Object.fromEntries(
			tables.map(({ name }) => [
				name,
				(db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name)
			])
		);
	};

	it('schema 1 plus its steps equals a new schema', () => {
		// Schema 1 is the current one without what the steps add.
		const v1 = SCHEMA.replace(
			/,\n\s*override TEXT[^\n]*\n\s*override_updated_at TEXT[^\n]*\n\s*api_url TEXT[^\n]*/,
			''
		)
			.replace(/\n-- "Since you looked"[^\n]*\nCREATE TABLE seen[^\n]*\n/, '\n')
			// Schema 1 still had pushed_at (a later step drops it).
			.replace(/(\n\s*pushed_updated_at TEXT,[^\n]*)/, '$1\n  pushed_at INTEGER,');
		expect(v1).toContain('pushed_at INTEGER');
		expect(v1).not.toContain('override');
		expect(v1).not.toContain('CREATE TABLE seen');
		const steps: string[] = [];
		for (let v = 1; v < SCHEMA_VERSION; v = MIGRATIONS[v].to) steps.push(MIGRATIONS[v].sql);
		expect(columns([v1, ...steps])).toEqual(columns([SCHEMA]));
	});
});
