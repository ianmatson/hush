import { snoozeEvent, snoozeOutcome } from './snooze';
import type { ActionKind, Classification, Enrichment } from './types';

/** Auto-resolved threads come back to the inbox when they need you again within this time. */
export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** What the watcher knows about a stored thread before it checks it again. */
export interface Watched {
	category: string;
	kind: string;
	triage: string;
	enrichment: Enrichment | null;
	resolvedAt: number | null;
	snoozeEvent: string | null;
	snoozedAt: number | null;
}

export interface WatchOutcome {
	triage: 'inbox' | 'done' | 'snoozed';
	resolvedAt: number | null;
	resolvedNote: string | null;
	/** Clear snoozed_until and snooze_event. */
	clearSnooze: boolean;
	/** A push to send: the thread needs you (again), or a snooze ended. */
	push: string | null;
}

/**
 * The next state of a thread that GitHub sent no new notification for, after a fresh look at its
 * PR or issue. `c` is the new classification. New notifications go through the poller's ingest
 * instead; this handles what changes without one: your own review, reply, or push, CI results,
 * merges, and closes.
 */
export function watchOutcome(
	w: Watched,
	c: Classification,
	e: Enrichment,
	me: string,
	now = Date.now()
): WatchOutcome {
	const keep: WatchOutcome = {
		triage: w.triage as WatchOutcome['triage'],
		resolvedAt: w.resolvedAt,
		resolvedNote: null,
		clearSnooze: false,
		push: null
	};
	const done = (note: string): WatchOutcome => ({
		...keep,
		triage: 'done',
		resolvedAt: now,
		resolvedNote: note
	});

	if (c.category === 'muted') return { ...keep, triage: 'done', resolvedAt: null };

	if (w.triage === 'snoozed') {
		const ev = snoozeEvent(w.snoozeEvent);
		const out = ev ? snoozeOutcome(ev.id, e, w.snoozedAt ?? 0, me) : null;
		if (!out?.wake) return keep;
		return { ...keep, triage: 'inbox', clearSnooze: true, push: `Snooze over: ${out.reason}` };
	}

	if (w.triage === 'inbox') {
		if (w.category === 'action' && c.category !== 'action')
			return done(resolvedNote(w.kind as ActionKind, w.enrichment, e, me));
		// FYI about something that closed since: the close is the last news, and it came (or
		// will come) as its own notification.
		if (w.category === 'fyi' && e.state !== 'open' && (w.enrichment?.state ?? 'open') === 'open')
			return done(e.state === 'merged' ? 'Merged' : 'Closed');
		if (w.category === 'fyi' && c.category === 'action') return { ...keep, push: c.summary };
		return keep;
	}

	if (
		w.triage === 'done' &&
		w.resolvedAt !== null &&
		now - w.resolvedAt < REOPEN_WINDOW_MS &&
		c.category === 'action'
	)
		return { ...keep, triage: 'inbox', resolvedAt: null, push: c.summary };

	return keep;
}

/**
 * Why a thread that needed you no longer does, in a few words. A note names a change only when
 * that change happened; otherwise the reason is a rule (a draft is never your turn, bots are FYI).
 */
export function resolvedNote(
	kind: ActionKind,
	before: Enrichment | null,
	e: Enrichment,
	me: string
): string {
	if (e.state === 'merged') return 'Merged';
	if (e.state === 'closed') return 'Closed';
	if (e.draft && !before?.draft) return 'Converted to draft';
	const newReview = !!e.myReview && e.myReview.at !== before?.myReview?.at;
	const newCommits = !!e.lastCommitAt && e.lastCommitAt !== before?.lastCommitAt;
	const lastByMe = e.lastComment?.author.toLowerCase() === me.toLowerCase();
	const other = e.draft ? 'Draft PR' : 'No longer needs you';
	switch (kind) {
		case 'review':
			if (newReview)
				return e.myReview!.state === 'APPROVED'
					? 'You approved'
					: e.myReview!.state === 'CHANGES_REQUESTED'
						? 'You requested changes'
						: 'You reviewed';
			// "Any review": someone else's verdict settled it.
			if (e.lastVerdict && e.lastVerdict.at !== before?.lastVerdict?.at)
				return `@${e.lastVerdict.by} reviewed`;
			return e.reviewRequestedFromMe ? other : 'Review no longer requested';
		case 'fix_ci':
			if (e.ci === 'SUCCESS') return 'CI passes now';
			if (e.ci === 'PENDING' || e.ci === 'EXPECTED') return 'CI is running again';
			return e.ci === 'FAILURE' || e.ci === 'ERROR' ? other : 'CI no longer fails';
		case 'address_review':
			if (newCommits) return 'You pushed changes';
			return e.reviewDecision === 'CHANGES_REQUESTED' ? other : 'Changes no longer requested';
		case 'resolve_conflict':
			return e.mergeable === 'CONFLICTING' ? other : 'Conflicts resolved';
		case 'merge':
			return other;
		case 'reply':
			if ((before?.openThreads ?? 0) > 0 && !e.openThreads) return 'Threads resolved';
			return lastByMe ? 'You replied' : newCommits ? 'You pushed changes' : other;
		case 'triage':
			if (before?.assignedToMe && e.assignedToMe === false) return 'No longer assigned to you';
			return lastByMe ? 'You replied' : other;
		default:
			return other;
	}
}
