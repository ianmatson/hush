import { ciFailing, ciPassing } from './ci';
import { requestedByName, sameLogin } from './logins';
import type { SubjectFacts } from './subject';
import type { Change } from './types';

/**
 * "Since you last looked": when you see an item, Hush keeps a small snapshot of its facts. Each
 * row then shows what changed since that snapshot: new commits, CI, reviews, comments, state.
 */
export interface Snapshot {
	commits: number;
	comments: number;
	ci: SubjectFacts['ci'];
	state: SubjectFacts['state'];
	draft: boolean;
	/** Each reviewer's latest approval or change request: login → state. */
	verdicts: Record<string, string>;
	/** Open review requests to you (by name). */
	requestedMe: boolean;
	labels: string[];
}

/** The snapshot of a subject when you look at it. */
export function snapshotOf(s: SubjectFacts, me: string): Snapshot {
	return {
		commits: s.commits ?? 0,
		comments: s.comments,
		ci: s.ci,
		state: s.state,
		draft: s.draft,
		verdicts: Object.fromEntries(s.verdicts.map((v) => [v.by, v.state])),
		requestedMe: requestedByName(s.reviewRequests, me),
		labels: s.labels.map((l) => l.name).sort()
	};
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What changed from `before` to `now`, most important first. Your own changes do not count. */
export function changesSince(before: Snapshot, now: SubjectFacts, me: string): Change[] {
	const after = snapshotOf(now, me);
	const out: Change[] = [];
	if (after.state !== before.state)
		out.push({
			kind: 'state',
			text: after.state === 'merged' ? 'Merged' : after.state === 'closed' ? 'Closed' : 'Reopened',
			tone: after.state === 'merged' ? 'good' : null
		});
	if (after.requestedMe && !before.requestedMe)
		out.push({ kind: 'requested', text: 'Your review is requested', tone: null });
	for (const [by, state] of Object.entries(after.verdicts)) {
		if (sameLogin(by, me) || before.verdicts[by] === state) continue;
		if (state === 'APPROVED') out.push({ kind: 'review', text: `@${by} approved`, tone: 'good' });
		else if (state === 'CHANGES_REQUESTED')
			out.push({ kind: 'review', text: `@${by} requested changes`, tone: 'bad' });
	}
	// 0 is "not known" (a PR has at least one commit; facts from before the count existed).
	if (before.commits > 0 && after.commits > before.commits)
		out.push({
			kind: 'commits',
			text: `+${plural(after.commits - before.commits, 'commit')}`,
			tone: null
		});
	if (after.ci !== before.ci && after.ci)
		out.push(
			ciPassing(after.ci)
				? { kind: 'ci', text: before.ci ? 'CI passes now' : 'CI passes', tone: 'good' }
				: ciFailing(after.ci)
					? { kind: 'ci', text: 'CI fails', tone: 'bad' }
					: { kind: 'ci', text: 'CI running', tone: null }
		);
	if (after.comments > before.comments)
		out.push({
			kind: 'comments',
			text: plural(after.comments - before.comments, 'new comment'),
			tone: null
		});
	// Only the author moves a PR in and out of draft: on your own PR, that was you.
	if (after.draft !== before.draft && !sameLogin(now.author, me))
		out.push({
			kind: 'draft',
			text: after.draft ? 'Back to draft' : 'Ready for review',
			tone: null
		});
	const added = after.labels.filter((l) => !before.labels.includes(l));
	if (added.length)
		out.push({
			kind: 'labels',
			text: added.map((l) => `+${l}`).join(' '),
			tone: null,
			labels: added
		});
	return out;
}

const KIND_ORDER: Change['kind'][] = [
	'state',
	'requested',
	'review',
	'commits',
	'ci',
	'comments',
	'draft',
	'labels'
];
const COUNTS_KEPT_FROM_OPENING = new Set<Change['kind']>(['commits', 'comments']);

export function withChangesSinceOpening(atOpening: Change[], now: Change[]): Change[] {
	const kindsNow = new Set(now.map((c) => c.kind));
	const kindsAtOpening = new Set(atOpening.map((c) => c.kind));
	const kept = atOpening.filter(
		(c) => !kindsNow.has(c.kind) || COUNTS_KEPT_FROM_OPENING.has(c.kind)
	);
	const added = now.filter(
		(c) => !kindsAtOpening.has(c.kind) || !COUNTS_KEPT_FROM_OPENING.has(c.kind)
	);
	return [...kept, ...added].sort(
		(a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
	);
}
