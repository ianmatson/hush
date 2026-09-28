import { latestActivity } from '../../src/lib/shared/activity';
import { changesSince, type Snapshot } from '../../src/lib/shared/changes';
import type { Enrichment, ItemDTO, ItemFacts } from '../../src/lib/shared/types';
import { enrichmentOf, type SubjectFacts } from '../../src/lib/shared/subject';
import type { SubjectRef } from '../github';
import { UPDATES_KEEP } from './shared';

/**
 * Each user's own SQLite database, in their Durable Object. One user per database, so no table
 * has a user id. Indexes cost a row write each, so there are only the ones the queries need.
 * Settings and the list version are Durable Object values (ctx.storage.kv), not tables.
 *
 * An **item** is one PR or issue (key "owner/repo#123"), or one other notification thread
 * (key "t:<thread id>": a release, a workflow run, an alert). Notifications, tracked searches,
 * and the watcher are only sources: they tell Hush that an item changed.
 */
export const SCHEMA_VERSION = 2;

const TABLES = `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,               -- GitHub notification thread id
  item_key TEXT NOT NULL,            -- items.key
  repo TEXT NOT NULL,
  subject_type TEXT NOT NULL,        -- PullRequest, Issue, CheckSuite, Release, ...
  title TEXT NOT NULL,
  html_url TEXT NOT NULL,
  reason TEXT NOT NULL,
  unread INTEGER NOT NULL,
  gh_updated_at TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL
);
CREATE INDEX threads_item ON threads (item_key);

CREATE TABLE items (
  key TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  number INTEGER,                    -- PRs and issues
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  event TEXT,                        -- the newest notification's reason, or NULL (a search found it)
  lane TEXT NOT NULL,                -- turn | waiting | updates | muted (see Placement)
  section TEXT,                      -- others | work (Your turn only)
  needs TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  why TEXT NOT NULL,                 -- the notification reason as words, or ''
  action_label TEXT NOT NULL,
  action_url TEXT NOT NULL,
  waiting_on TEXT,
  waiting_since TEXT,
  priority INTEGER NOT NULL,
  rule TEXT,
  sig TEXT NOT NULL,                 -- the turn's signature: its reason and the newest activity
  state TEXT NOT NULL,               -- active | done | snoozed | muted (what you did with it)
  done_sig TEXT,                     -- sig when you chose Done: a new sig brings it back
  override TEXT,                     -- turn | updates: "It is my turn" / "Not my turn", until sig changes
  override_sig TEXT,
  snoozed_until INTEGER,
  snooze_event TEXT,
  snoozed_at INTEGER,
  finished_at INTEGER,               -- Hush took it out of Your turn by itself…
  finished_note TEXT,                -- …and why ("You approved")
  seen_at INTEGER,
  seen_snapshot TEXT,                -- facts when you last saw it (shared/changes.ts)
  pushed_sig TEXT,                   -- sig of the last push for it
  pushed_at INTEGER,                 -- when that push went out (a resolution updates it)
  sources TEXT NOT NULL,             -- JSON list: "notification", "search:<id>", "follow"
  activity_at TEXT NOT NULL,         -- the newest activity (orders Updates)
  first_seen_at INTEGER NOT NULL
);
CREATE INDEX items_lane ON items (lane, state);

-- The one record of each PR or issue's facts (SubjectFacts JSON), for every item.
CREATE TABLE subjects (
  key TEXT PRIMARY KEY,
  facts TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

-- Alerts Hush pushed (the bell), for 30 days. item_key: items.key.
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
`;

/**
 * v1 settings under their v2 names. Rules, views, menus, and keys changed shape, so they start
 * again (Hush drops a value that the v2 checks refuse).
 */
export function settingsFromV1(old: Record<string, unknown>): Record<string, unknown> {
	const dash = (old.dash ?? {}) as Record<string, unknown>;
	const out: Record<string, unknown> = {
		push: old.pushAction,
		pushResolved: old.pushResolved,
		quietHours: old.quietHours,
		reviewResolution: old.reviewResolution,
		botsAreUpdates: old.botsAreFyi,
		teamReviewsAreMine: old.teamReviewsAreAction,
		markReadOnGitHub: old.peekMarksRead,
		staleDays: dash.staleDays,
		searchScope: dash.scope,
		excludedTeams: dash.excludedTeams
	};
	return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/**
 * How to get to SCHEMA_VERSION from each older version. v1 → v2 is the move from threads and
 * dashboards to items: the notification tables start again (the next poll reads the last 14 days
 * again), and push devices and the subject facts stay.
 */
export const MIGRATIONS: Record<number, { sql: string; resetKeys: string[] }> = {
	0: { sql: TABLES, resetKeys: [] },
	1: {
		sql: `
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS dash_hidden;
DROP TABLE IF EXISTS dash_moves;
DROP TABLE IF EXISTS dash_order;
DROP TABLE IF EXISTS alerts;
${TABLES.slice(0, TABLES.indexOf('-- The one record'))}
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  item_key TEXT
);`,
		resetKeys: [
			'initialized',
			'lastModified',
			'threadsVersion',
			'watchCursor',
			'lastWatch',
			'dash:pr',
			'dash:issue',
			'dash:counts:pr',
			'dash:counts:issue'
		]
	}
};

export interface ThreadRow {
	id: string;
	item_key: string;
	repo: string;
	subject_type: string;
	title: string;
	html_url: string;
	reason: string;
	unread: number;
	gh_updated_at: string;
	first_seen_at: number;
}

export interface ItemRow {
	key: string;
	repo: string;
	number: number | null;
	subject_type: string;
	title: string;
	url: string;
	event: string | null;
	lane: string;
	section: string | null;
	needs: string;
	summary: string;
	reason: string;
	why: string;
	action_label: string;
	action_url: string;
	waiting_on: string | null;
	waiting_since: string | null;
	priority: number;
	rule: string | null;
	sig: string;
	state: string;
	done_sig: string | null;
	override: string | null;
	override_sig: string | null;
	snoozed_until: number | null;
	snooze_event: string | null;
	snoozed_at: number | null;
	finished_at: number | null;
	finished_note: string | null;
	seen_at: number | null;
	seen_snapshot: string | null;
	pushed_sig: string | null;
	pushed_at: number | null;
	sources: string;
	activity_at: string;
	first_seen_at: number;
}

/** An item with its subject's facts (JSON), from ITEMS. */
export interface ItemWithFacts extends ItemRow {
	facts: string | null;
}

/** Items with their subject's facts; add a WHERE on item columns. */
export const ITEMS =
	'SELECT items.*, subjects.facts FROM items LEFT JOIN subjects ON subjects.key = items.key';

export const factsOf = (r: { facts: string | null }): SubjectFacts | null =>
	r.facts ? (JSON.parse(r.facts) as SubjectFacts) : null;

export const sourcesOf = (r: Pick<ItemRow, 'sources'>): string[] =>
	JSON.parse(r.sources || '[]') as string[];

/** The placement's input for a stored item. */
export function itemFactsOf(
	r: Pick<ItemRow, 'repo' | 'subject_type' | 'title' | 'url' | 'event'>,
	subject: SubjectFacts | null,
	me: string,
	myTeams: string[] = []
): ItemFacts {
	const enrichment: Enrichment | null = subject ? enrichmentOf(subject, me) : null;
	return {
		repo: r.repo,
		subjectType: r.subject_type,
		title: subject?.title ?? r.title,
		reason: r.event ?? '',
		htmlUrl: subject?.url ?? r.url,
		enrichment,
		subject,
		me,
		myTeams
	};
}

/** Owner, repo, and number of an item's PR or issue, from its key. */
export function subjectRefOf(key: string): SubjectRef | null {
	const m = key.match(/^([^/]+)\/([^#]+)#(\d+)$/);
	return m ? { key, owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

/** An item's lane for the app: your override wins until the item changes. */
export const laneOf = (r: Pick<ItemRow, 'lane' | 'override'>): ItemDTO['lane'] =>
	(r.override as ItemDTO['lane']) ?? (r.lane as ItemDTO['lane']);

export function toDTO(r: ItemWithFacts, me: string, staleDays: number, now = Date.now()): ItemDTO {
	const f = factsOf(r);
	const seen = r.seen_snapshot ? (JSON.parse(r.seen_snapshot) as Snapshot) : null;
	const lane = laneOf(r);
	return {
		key: r.key,
		repo: r.repo,
		number: r.number,
		subjectType: r.subject_type,
		title: f?.title ?? r.title,
		url: f?.url ?? r.url,
		lane,
		section: lane === 'turn' ? ((r.section as ItemDTO['section']) ?? 'others') : null,
		needs: r.needs as ItemDTO['needs'],
		summary: r.summary,
		reason: r.reason,
		event: r.why,
		eventKey: r.event,
		actionLabel: r.action_label,
		actionUrl: r.action_url,
		waitingOn: r.waiting_on,
		waitingSince: r.waiting_since,
		stale:
			(lane === 'turn' || lane === 'waiting') &&
			!!r.waiting_since &&
			now - Date.parse(r.waiting_since) > staleDays * 86_400_000,
		state: r.state as ItemDTO['state'],
		snoozedUntil: r.snoozed_until,
		snoozeEvent: r.snooze_event,
		rule: r.rule,
		finished:
			r.finished_at && r.finished_note ? { at: r.finished_at, note: r.finished_note } : null,
		override: (r.override as ItemDTO['override']) ?? null,
		author: f?.author ?? null,
		authorAvatar: f?.authorAvatar ?? null,
		authorIsBot: !!f?.authorIsBot,
		labels: f?.labels.map((l) => l.name) ?? [],
		draft: !!f?.draft,
		ci: f?.ci ?? null,
		prState: f?.state ?? null,
		additions: f?.additions ?? 0,
		deletions: f?.deletions ?? 0,
		activity: latestActivity(f),
		activityAt: r.activity_at,
		unseen: !r.seen_at || Date.parse(r.activity_at) > r.seen_at,
		seenAt: r.seen_at,
		changes: seen && f ? changesSince(seen, f, me) : null
	};
}

/** Items the watcher looks at: PRs and issues in Your turn or Waiting, or waiting for an event. */
export const WATCHED = `number IS NOT NULL AND state != 'muted' AND lane != 'muted'
  AND (lane IN ('turn', 'waiting') OR (state = 'snoozed' AND snooze_event IS NOT NULL))`;

/** The lists the app asks for: a lane, or what you did with items. */
export type ListView = 'turn' | 'waiting' | 'updates' | 'muted' | 'done' | 'snoozed' | 'all';

/** The WHERE of a list, and its bind values. A snooze whose time passed counts as active. */
export function viewWhere(
	view: ListView,
	now = Date.now()
): { where: string; args: (string | number)[] } {
	const active = `(state = 'active' OR (state = 'snoozed' AND snoozed_until <= ?))`;
	const lane = `COALESCE(override, lane)`;
	switch (view) {
		case 'turn':
			return { where: `${lane} = 'turn' AND ${active}`, args: [now] };
		case 'waiting':
			return { where: `${lane} = 'waiting' AND ${active}`, args: [now] };
		case 'updates':
			return {
				where: `${lane} = 'updates' AND ${active} AND activity_at > ?`,
				args: [now, new Date(now - UPDATES_KEEP).toISOString()]
			};
		case 'done':
			return { where: `state = 'done'`, args: [] };
		case 'snoozed':
			return { where: `state = 'snoozed' AND snoozed_until > ?`, args: [now] };
		case 'muted':
			return { where: `(state = 'muted' OR lane = 'muted')`, args: [] };
		default:
			return { where: '1', args: [] };
	}
}
