import type { Poller } from './poller';
import type { Enrichment, ThreadDTO } from '../src/lib/shared/types';
export { parseSettings } from '../src/lib/shared/settings';
import { decryptSecret } from './crypto';

export interface Env {
	DB: D1Database;
	POLLER: DurableObjectNamespace<Poller>;
	ASSETS: Fetcher;
	TOKEN_ENC_KEY: string;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	/** Optional push contact (mailto: or https:). Defaults to the app's own URL. */
	VAPID_SUBJECT?: string;
	/** Comma-separated GitHub orgs whose members may use Hush. Empty = anyone with a token. */
	ALLOWED_ORGS?: string;
	// Rate limiters (optional, so tests and old configs still work).
	AUTH_LIMIT?: RateLimit;
	FEED_LIMIT?: RateLimit;
	API_LIMIT?: RateLimit;
}

export interface UserRow {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string | null;
	token_ct: string;
	token_iv: string;
	scopes: string;
	settings: string;
	last_poll_at: number | null;
	last_poll_error: string | null;
	threads_version: number;
	last_seen_at: number | null;
	access_checked_at: number | null;
}

/** Mark the user's threads as changed, so the next inbox request gets fresh data. */
export const bumpVersion = (env: Env, userId: number) =>
	env.DB.prepare('UPDATE users SET threads_version = threads_version + 1 WHERE id = ?').bind(
		userId
	);

export interface ThreadRow {
	user_id: number;
	id: string;
	repo: string;
	subject_type: string;
	title: string;
	html_url: string;
	reason: string;
	unread: number;
	gh_updated_at: string;
	enrichment: string | null;
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
	pushed_updated_at: string | null;
	first_seen_at: number;
	resolved_at: number | null;
	resolved_note: string | null;
	marked_unread_at: number | null;
	pushed_at: number | null;
}

export function getUser(env: Env, id: number) {
	return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export function userToken(env: Env, u: UserRow): Promise<string> {
	return decryptSecret(u.token_ct, u.token_iv, env.TOKEN_ENC_KEY);
}

export function toDTO(r: ThreadRow): ThreadDTO {
	const e = r.enrichment ? (JSON.parse(r.enrichment) as Enrichment) : null;
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
		number: e?.number ?? null,
		state: e?.state ?? null,
		draft: !!e?.draft,
		ci: e?.ci ?? null,
		author: e?.author ?? null,
		authorIsBot: !!e?.authorIsBot,
		labels: e?.labels ?? [],
		rule: r.rule
	};
}

/**
 * SQL for a view. A snoozed thread whose time has passed counts as "inbox" again.
 * `?1` is the user id and `?2` is "now" in ms.
 */
export function viewWhere(view: string): string {
	const inbox = `(triage = 'inbox' OR (triage = 'snoozed' AND snoozed_until <= ?2))`;
	// Every view must use both ?1 and ?2: D1 rejects a statement that has more bindings than parameters.
	const unusedNow = `?2 IS NOT NULL`;
	switch (view) {
		case 'action':
			return `user_id = ?1 AND category = 'action' AND ${inbox}`;
		case 'fyi':
			return `user_id = ?1 AND category = 'fyi' AND ${inbox}`;
		case 'inbox':
			return `user_id = ?1 AND category IN ('action', 'fyi') AND ${inbox}`;
		case 'snoozed':
			return `user_id = ?1 AND triage = 'snoozed' AND snoozed_until > ?2`;
		case 'done':
			return `user_id = ?1 AND triage = 'done' AND category != 'muted' AND ${unusedNow}`;
		case 'muted':
			return `user_id = ?1 AND category = 'muted' AND ${unusedNow}`;
		default:
			return `user_id = ?1 AND ${unusedNow}`;
	}
}

/** The classifier's input for a stored thread. */
export function factsFromRow(r: ThreadRow, me: string, myTeams: string[] = []) {
	return {
		myTeams,
		repo: r.repo,
		subjectType: r.subject_type,
		title: r.title,
		reason: r.reason,
		htmlUrl: r.html_url,
		enrichment: r.enrichment ? (JSON.parse(r.enrichment) as Enrichment) : null,
		me
	};
}
