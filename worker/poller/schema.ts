import { latestActivity } from '../../src/lib/shared/activity';
import type { Enrichment, ThreadDTO, ThreadFacts } from '../../src/lib/shared/types';
import { enrichmentOf, type SubjectFacts } from '../../src/lib/shared/subject';
import {
	NO_DECISIONS,
	parseStoredDecisions,
	readDecisions,
	type SubjectDecisions
} from '../../src/lib/shared/decisions';
import type { SubjectRef } from '../github';

/**
 * Each user's own SQLite database, in their Durable Object. One user per database, so no table
 * has a user id. Indexes cost a row write each, so there are only the ones the queries need.
 * Settings and the list version are Durable Object values (ctx.storage.kv), not tables.
 */
// Schema 2 was the "lanes" layout (reverted and wiped; see migrate()).
export const SCHEMA_VERSION = 17;
const DECISIONS_TABLE = `CREATE TABLE IF NOT EXISTS decisions (key TEXT PRIMARY KEY, answers TEXT NOT NULL, at INTEGER NOT NULL);`;
const ITEM_PINS_TABLE = `CREATE TABLE IF NOT EXISTS item_pins (key TEXT PRIMARY KEY, pinned TEXT NOT NULL DEFAULT '[]');`;
const TRACKED_ITEMS_TABLE = `CREATE TABLE IF NOT EXISTS tracked_items (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL, categories TEXT NOT NULL DEFAULT '[]');`;
export const SCHEMA = `
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

${DECISIONS_TABLE}

${ITEM_PINS_TABLE}

${TRACKED_ITEMS_TABLE}
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
${TRACKED_ITEMS_TABLE.replace('tracked_items', 'tracked_items_next')}
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
	}
};

export interface ThreadRow {
	id: string;
	repo: string;
	subject_type: string;
	subject_key: string | null;
	title: string;
	html_url: string;
	reason: string;
	unread: number;
	gh_updated_at: string;
	category: string;
	kind: string;
	summary: string;
	why: string;
	action_label: string;
	action_url: string;
	rule: string | null;
	triage: string;
	snoozed_until: number | null;
	snooze_event: string | null;
	snoozed_at: number | null;
	resolved_at: number | null;
	resolved_note: string | null;
	marked_unread_at: number | null;
	pushed_updated_at: string | null;
	first_seen_at: number;
	override: string | null;
	override_updated_at: string | null;
	api_url: string | null;
}

/** A thread with its subject's facts (JSON), from THREADS. */
export interface ThreadWithFacts extends ThreadRow {
	facts: string | null;
	decisions?: string | null;
	item_categories?: string | null;
}

/** Threads with their subject's facts; add a WHERE on thread columns. */
export const THREADS = `SELECT threads.*, subjects.facts, decisions.answers AS decisions,
    items.item_categories FROM threads
  LEFT JOIN subjects ON subjects.key = threads.subject_key
  LEFT JOIN decisions ON decisions.key = threads.subject_key
  LEFT JOIN (SELECT key AS item_key, categories AS item_categories FROM tracked_items)
    AS items ON items.item_key = threads.subject_key`;

const idsOf = (json: string | null | undefined): string[] =>
	json ? (JSON.parse(json) as string[]) : [];

export const factsOf = (r: ThreadWithFacts): SubjectFacts | null =>
	r.facts ? (JSON.parse(r.facts) as SubjectFacts) : null;

/** The inbox's view of the thread's subject, or null (releases, CI runs, a subject not read yet). */
export function decisionsFor(r: ThreadWithFacts): SubjectDecisions {
	const f = factsOf(r);
	return f ? readDecisions(parseStoredDecisions(r.decisions), f) : NO_DECISIONS;
}

export function enrichmentFor(r: ThreadWithFacts, me: string): Enrichment | null {
	const f = factsOf(r);
	return f ? enrichmentOf(f, me, decisionsFor(r)) : null;
}

/** The classifier's input for a stored thread. */
export function factsFromRow(r: ThreadWithFacts, me: string, myTeams: string[] = []): ThreadFacts {
	return {
		myTeams,
		repo: r.repo,
		subjectType: r.subject_type,
		title: r.title,
		reason: r.reason,
		htmlUrl: r.html_url,
		enrichment: enrichmentFor(r, me),
		me
	};
}

/** Owner, repo, and number of a thread's PR or issue, from its subject key. */
export function subjectRefOf(r: Pick<ThreadRow, 'id' | 'subject_key'>): SubjectRef | null {
	const m = r.subject_key?.match(/^([^/]+)\/([^#]+)#(\d+)$/);
	return m ? { key: r.id, owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

export function toDTO(r: ThreadWithFacts): ThreadDTO {
	const f = factsOf(r);
	return {
		id: r.id,
		repo: r.repo,
		subjectType: r.subject_type,
		title: r.title,
		reason: r.reason,
		unread: !!r.unread,
		updatedAt: r.gh_updated_at,
		htmlUrl: r.html_url,
		category: r.category as ThreadDTO['category'],
		kind: r.kind as ThreadDTO['kind'],
		summary: r.summary,
		why: r.why,
		actionLabel: r.action_label,
		actionUrl: r.action_url,
		triage: r.triage as ThreadDTO['triage'],
		snoozedUntil: r.snoozed_until,
		snoozeEvent: r.snooze_event,
		resolvedNote: r.triage === 'done' ? r.resolved_note : null,
		// The number is in the key, so a thread can be peeked before its subject is read.
		number: subjectRefOf(r)?.number ?? null,
		state: f?.state ?? null,
		draft: !!f?.draft,
		ci: f?.ci ?? null,
		author: f?.author ?? null,
		authorIsBot: !!f?.authorIsBot,
		labels: f?.labels.map((l) => l.name) ?? [],
		rule: r.rule,
		categories: idsOf(r.item_categories),
		activity: latestActivity(f),
		override: r.override === 'fyi' && r.override_updated_at === r.gh_updated_at,
		smart: decisionsFor(r).smart
	};
}

/** The WHERE of a view, and its bind values. A snoozed thread whose time passed is "inbox" again. */
export function viewWhere(view: string, now = Date.now()): { where: string; args: number[] } {
	const inbox = `(triage = 'inbox' OR (triage = 'snoozed' AND snoozed_until <= ?))`;
	switch (view) {
		case 'action':
			return { where: `category = 'action' AND ${inbox}`, args: [now] };
		case 'fyi':
			return { where: `category = 'fyi' AND ${inbox}`, args: [now] };
		case 'inbox':
			return { where: `category IN ('action', 'fyi') AND ${inbox}`, args: [now] };
		case 'snoozed':
			return { where: `triage = 'snoozed' AND snoozed_until > ?`, args: [now] };
		case 'done':
			return { where: `triage = 'done' AND category != 'muted'`, args: [] };
		case 'muted':
			return { where: `category = 'muted'`, args: [] };
		default:
			return { where: '1', args: [] };
	}
}

/** Threads the watcher looks at: open PR and issue work. Bind the reopen cutoff. */
export const WATCHED = `subject_type IN ('PullRequest', 'Issue') AND category != 'muted'
  AND (triage = 'inbox' OR (triage = 'snoozed' AND snooze_event IS NOT NULL)
       OR (triage = 'done' AND resolved_at > ?))`;
