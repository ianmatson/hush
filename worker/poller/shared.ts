import type { Enrichment, Settings } from '../../src/lib/shared/types';
import type { ThreadRow } from '../db';
import type { SubjectRef } from '../github';

export const MIN = 60_000;
export const ACTIVE_WINDOW = 15 * MIN;
export const FIRST_SYNC_DAYS = 14;
export const MAX_INDIVIDUAL_PUSHES = 3;
export const TEAMS_TTL = 6 * 60 * MIN;
export const DAY = 24 * 60 * MIN;
// Stop polling for accounts nobody uses. Opening Hush (or signing in) starts it again.
export const PAUSE_AFTER_NO_PUSH = 14 * DAY;
export const PAUSE_AFTER_WITH_PUSH = 90 * DAY;
export const ACCESS_RECHECK = DAY;
// The inbox watcher: how often it looks again at open PR and issue threads (see watch()), and
// how many threads it checks each time (two GraphQL requests of 40).
export const WATCH_EVERY = 15 * MIN;
export const WATCH_BATCH = 80;
// Read and done states come from GitHub for threads updated in this window.
export const SYNC_DAYS = 14;
/** Alerts pushed within this time are updated when their thread is resolved. */
export const RESOLVE_WINDOW = DAY;
// A manual refresh checks up to this many inbox threads again, at most once a minute.
export const INBOX_CHECK_MAX = 40;
export const INBOX_CHECK_GAP = MIN;
/** The alert history (the bell) keeps this long. */
export const ALERT_LOG_KEEP = 30 * DAY;

/** Push tags that are not a thread id. */
export const NON_THREAD_TAGS = new Set(['digest', 'test']);
// Poll every 5 minutes while someone can see the result (push on, or Hush open lately), else
// every 15. Push arrives a few minutes late, but each user costs a fifth of the Cloudflare budget.
export const POLL_ACTIVE = 5 * MIN;
export const POLL_IDLE = 15 * MIN;
export const DASH_TTL = 15 * MIN;
export const MUTED_BY_USER = 'Muted by you';

export interface PollStatus {
	lastPollAt: number | null;
	lastError: string | null;
	nextPollAt: number | null;
	/** Orgs whose notifications GitHub hides until the token is SAML-authorized. */
	ssoHiddenOrgs: number;
	/** Threads a manual refresh moved to Done (see checkInbox). */
	resolved?: { title: string; note: string }[];
}

export type Existing = Pick<
	ThreadRow,
	| 'id'
	| 'gh_updated_at'
	| 'triage'
	| 'pushed_updated_at'
	| 'enrichment'
	| 'category'
	| 'rule'
	| 'snooze_event'
	| 'snoozed_at'
>;

/** Threads the watcher looks at: open PR and issue work. ?1 user id, ?2 the reopen cutoff. */
export const WATCHED = `user_id = ?1 AND subject_type IN ('PullRequest', 'Issue') AND category != 'muted'
  AND (triage = 'inbox' OR (triage = 'snoozed' AND snooze_event IS NOT NULL)
       OR (triage = 'done' AND resolved_at > ?2))`;

/** What the subject store needs about the user to update their views. */
export interface Who {
	userId: number;
	me: string;
	settings: Settings;
	/** Team slugs whose review requests count in the inbox (Settings → Inbox). */
	inboxTeams: string[];
}

export type Resolved = { id: string; title: string; note: string };

/** Owner, repo, and number of a stored thread's PR or issue. */
export function subjectRefOf(
	r: Pick<ThreadRow, 'id' | 'repo' | 'enrichment' | 'html_url'>
): SubjectRef | null {
	const [owner, repo] = r.repo.split('/');
	const num =
		(r.enrichment ? (JSON.parse(r.enrichment) as Enrichment).number : undefined) ??
		Number(r.html_url.match(/\/(?:pull|issues)\/(\d+)$/)?.[1]);
	return owner && repo && num ? { key: r.id, owner, repo, number: num } : null;
}

export const clearSnooze = (db: D1Database, userId: number, id: string) =>
	db
		.prepare(
			`UPDATE threads SET snoozed_until = NULL, snooze_event = NULL WHERE user_id = ? AND id = ?`
		)
		.bind(userId, id);

/**
 * One Durable Object per user. An alarm polls the GitHub Notifications API, enriches changed
 * threads, classifies them, writes them to D1, and sends Web Push for new Action items.
 */
