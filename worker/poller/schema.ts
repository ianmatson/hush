import { latestActivity } from '../../src/lib/shared/activity';
import type { Enrichment, ThreadDTO, ThreadFacts } from '../../src/lib/shared/types';
import { enrichmentOf, type SubjectFacts } from '../../src/lib/shared/subject';
import type { SubjectRef } from '../github';

/**
 * Each user's own SQLite database, in their Durable Object. One user per database, so no table
 * has a user id. Indexes cost a row write each, so there are only the ones the queries need.
 * Settings and the list version are Durable Object values (ctx.storage.kv), not tables.
 */
export const SCHEMA_VERSION = 1;
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
  pushed_at INTEGER,                 -- when that push went out (a resolution updates it)
  first_seen_at INTEGER NOT NULL
);
CREATE INDEX threads_view ON threads (category, triage);
CREATE INDEX threads_subject ON threads (subject_key);

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

-- Your dashboard marks: hidden and moved last until the item changes (its updatedAt moves).
CREATE TABLE dash_hidden (item_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL);
CREATE TABLE dash_moves (item_id TEXT PRIMARY KEY, turn TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE dash_order (item_id TEXT PRIMARY KEY, rank INTEGER NOT NULL);
`;

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
	pushed_at: number | null;
	first_seen_at: number;
}

/** A thread with its subject's facts (JSON), from THREADS. */
export interface ThreadWithFacts extends ThreadRow {
	facts: string | null;
}

/** Threads with their subject's facts; add a WHERE on thread columns. */
export const THREADS =
	'SELECT threads.*, subjects.facts FROM threads LEFT JOIN subjects ON subjects.key = threads.subject_key';

export const factsOf = (r: ThreadWithFacts): SubjectFacts | null =>
	r.facts ? (JSON.parse(r.facts) as SubjectFacts) : null;

/** The inbox's view of the thread's subject, or null (releases, CI runs, a subject not read yet). */
export function enrichmentFor(r: ThreadWithFacts, me: string): Enrichment | null {
	const f = factsOf(r);
	return f ? enrichmentOf(f, me) : null;
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
		activity: latestActivity(f)
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
