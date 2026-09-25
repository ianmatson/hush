import type { Enrichment } from './types';

export type SnoozeEvent =
	'ci_pass' | 'ci_done' | 'approved' | 'review' | 'reply' | 'commits' | 'closed';

export interface SnoozeEventInfo {
	id: SnoozeEvent;
	/** Menu label: "Until CI passes". */
	label: string;
	/** Push and chip text when it happens: "CI passed". */
	happened: string;
	kinds: ('pr' | 'issue')[];
}

export const SNOOZE_EVENTS: SnoozeEventInfo[] = [
	{ id: 'ci_pass', label: 'CI passes', happened: 'CI passed', kinds: ['pr'] },
	{ id: 'ci_done', label: 'CI finishes', happened: 'CI finished', kinds: ['pr'] },
	{ id: 'approved', label: 'Someone approves', happened: 'Approved', kinds: ['pr'] },
	{ id: 'review', label: 'A new review', happened: 'New review', kinds: ['pr'] },
	{ id: 'commits', label: 'New commits', happened: 'New commits', kinds: ['pr'] },
	{ id: 'reply', label: 'Someone replies', happened: 'New reply', kinds: ['pr', 'issue'] },
	{
		id: 'closed',
		label: 'It is merged or closed',
		happened: 'Merged or closed',
		kinds: ['pr', 'issue']
	}
];

export const snoozeEvent = (id: string | null | undefined) =>
	SNOOZE_EVENTS.find((e) => e.id === id);

/** A conditional snooze also ends at this deadline, so nothing sleeps forever. */
export const SNOOZE_EVENT_MAX_MS = 7 * 24 * 3600_000;

/** Events that make sense for every one of these subjects. */
export function eventsFor(kinds: ('pr' | 'issue' | 'other')[]): SnoozeEventInfo[] {
	if (!kinds.length || kinds.includes('other')) return [];
	return SNOOZE_EVENTS.filter((e) => kinds.every((k) => e.kinds.includes(k as 'pr' | 'issue')));
}

const after = (iso: string | null | undefined, ms: number) => !!iso && Date.parse(iso) > ms;

/** Did the event happen since `since` (ms)? `me` is your login, so your own actions do not count. */
export function eventHappened(
	event: SnoozeEvent,
	e: Enrichment | null,
	since: number,
	me: string
): boolean {
	if (!e || e.kind === 'other') return false;
	const meL = me.toLowerCase();
	switch (event) {
		case 'ci_pass':
			return e.ci === 'SUCCESS';
		case 'ci_done':
			return e.ci === 'SUCCESS' || e.ci === 'FAILURE' || e.ci === 'ERROR';
		case 'approved':
			return e.reviewDecision === 'APPROVED';
		case 'review':
			return (
				!!e.latestReview &&
				e.latestReview.author.toLowerCase() !== meL &&
				after(e.latestReview.at, since)
			);
		case 'commits':
			return after(e.lastCommitAt, since);
		case 'reply': {
			const c = e.lastComment;
			const commented =
				!!c && c.author.toLowerCase() !== meL && !c.authorIsBot && after(c.createdAt, since);
			const reviewed =
				!!e.latestReview &&
				e.latestReview.author.toLowerCase() !== meL &&
				after(e.latestReview.at, since);
			return commented || reviewed;
		}
		case 'closed':
			return e.state === 'merged' || e.state === 'closed';
	}
}

/** GitHub subject type → the kinds that snooze events know about. */
export const subjectKind = (subjectType: string): 'pr' | 'issue' | 'other' =>
	subjectType === 'PullRequest' ? 'pr' : subjectType === 'Issue' ? 'issue' : 'other';

/** Conditions that are already true for a thread, as far as the list row knows. */
export function alreadyTrue(t: { ci?: string | null; state?: string | null }): SnoozeEvent[] {
	const out: SnoozeEvent[] = [];
	if (t.ci === 'SUCCESS') out.push('ci_pass');
	if (t.ci === 'SUCCESS' || t.ci === 'FAILURE' || t.ci === 'ERROR') out.push('ci_done');
	// A merged or closed subject ends every conditional snooze at once.
	if (t.state === 'merged' || t.state === 'closed') return SNOOZE_EVENTS.map((e) => e.id);
	return out;
}

/**
 * Should a conditional snooze end now, and why? The event itself, or a merged/closed subject:
 * then no other event can still happen, so waiting longer is pointless.
 */
export function snoozeOutcome(
	event: SnoozeEvent,
	e: Enrichment | null,
	since: number,
	me: string
): { wake: false } | { wake: true; reason: string } {
	if (eventHappened(event, e, since, me))
		return { wake: true, reason: snoozeEvent(event)!.happened };
	if (e && (e.state === 'merged' || e.state === 'closed'))
		return { wake: true, reason: e.state === 'merged' ? 'Merged' : 'Closed' };
	return { wake: false };
}
