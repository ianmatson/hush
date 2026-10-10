import { enrichmentOf, type SubjectFacts } from './subject';
import { markState, MUTED_AT, type ItemMark } from './item-snooze';
import { snoozeOutcome } from './snooze';

export type PushFact =
	| 'review-requested'
	| 'team-review-requested'
	| 'mentioned'
	| 'replied'
	| 'approved'
	| 'changes-requested'
	| 'ci-failed'
	| 'ci-passed'
	| 'assigned'
	| 'snooze-over';

export const PUSH_FACTS: { id: PushFact; label: string; note: string }[] = [
	{
		id: 'review-requested',
		label: 'Your review is requested',
		note: 'By name, also again after your review.'
	},
	{
		id: 'team-review-requested',
		label: "Your team's review is requested",
		note: 'A team that you track in Settings → Views → Teams.'
	},
	{ id: 'mentioned', label: 'You are mentioned', note: 'Someone writes @you or @your-team.' },
	{
		id: 'replied',
		label: 'Someone replies',
		note: 'A comment on your pull request or issue, or right after your comment.'
	},
	{ id: 'approved', label: 'Your pull request is approved', note: '' },
	{ id: 'changes-requested', label: 'Changes are requested on your pull request', note: '' },
	{ id: 'ci-failed', label: 'CI fails on your pull request', note: '' },
	{ id: 'ci-passed', label: 'CI passes on your pull request', note: '' },
	{ id: 'assigned', label: 'You are assigned', note: '' },
	{
		id: 'snooze-over',
		label: 'A snooze ends',
		note: 'When the thing that you snoozed it until happens, such as CI passes.'
	}
];

export const DEFAULT_PUSH_FACTS: PushFact[] = [
	'review-requested',
	'mentioned',
	'replied',
	'approved',
	'changes-requested',
	'ci-failed',
	'assigned',
	'snooze-over'
];

export const pushFactOk = (v: unknown): v is PushFact => PUSH_FACTS.some((f) => f.id === v);

export function validatePushFacts(v: unknown): string | null {
	if (!Array.isArray(v)) return '"pushFacts" must be a list.';
	const unknown = v.find((x) => !pushFactOk(x));
	if (unknown !== undefined) return `"pushFacts": unknown fact "${String(unknown)}".`;
	if (new Set(v).size !== v.length) return '"pushFacts" has a fact twice.';
	return null;
}

export const knownPushFacts = (saved: unknown): PushFact[] =>
	Array.isArray(saved) ? [...new Set(saved.filter(pushFactOk))] : DEFAULT_PUSH_FACTS;

export interface FactEvent {
	fact: PushFact;
	title: string;
}

const FAILING_CI = new Set(['FAILURE', 'ERROR']);

export function factEvents(
	before: SubjectFacts | null,
	after: SubjectFacts,
	me: string,
	myTeams: Set<string>,
	since: number
): FactEvent[] {
	const meL = me.toLowerCase();
	const isMe = (login: string | null | undefined) => login?.toLowerCase() === meL;
	const newerThan = (at: string | null | undefined, than: number) => !!at && Date.parse(at) > than;
	const mine = isMe(after.author);
	const pr = after.kind === 'pr';
	const events: FactEvent[] = [];

	const requestedMe = (s: SubjectFacts) => s.reviewRequests.some((r) => !r.team && isMe(r.name));
	const requestedTeam = (s: SubjectFacts) =>
		s.reviewRequests.find((r) => r.team && myTeams.has(r.name))?.name ?? null;
	const requestedSince = (team: boolean) =>
		after.requestEvents.some(
			(e) =>
				e.team === team && (team ? myTeams.has(e.name) : isMe(e.name)) && newerThan(e.at, since)
		);

	if (requestedMe(after) && (before ? !requestedMe(before) : requestedSince(false)))
		events.push({ fact: 'review-requested', title: 'Review requested' });
	const team = requestedTeam(after);
	if (team && (before ? !requestedTeam(before) : requestedSince(true)))
		events.push({ fact: 'team-review-requested', title: `Review requested from ${team}` });

	const assignedMe = (s: SubjectFacts) => s.assignees.some(isMe);
	if (assignedMe(after) && (before ? !assignedMe(before) : newerThan(after.createdAt, since)))
		events.push({ fact: 'assigned', title: 'Assigned to you' });

	const review = after.latestReview;
	const reviewIsNew =
		!!review &&
		!isMe(review.author) &&
		newerThan(review.at, before?.latestReview ? Date.parse(before.latestReview.at) : since);
	if (pr && mine && reviewIsNew && review.state === 'APPROVED')
		events.push({ fact: 'approved', title: `Approved by ${review.author}` });
	if (pr && mine && reviewIsNew && review.state === 'CHANGES_REQUESTED')
		events.push({ fact: 'changes-requested', title: `${review.author} requested changes` });

	if (pr && mine && before && FAILING_CI.has(after.ci ?? '') && !FAILING_CI.has(before.ci ?? ''))
		events.push({ fact: 'ci-failed', title: 'CI failed' });
	if (pr && mine && before && after.ci === 'SUCCESS' && before.ci !== 'SUCCESS')
		events.push({ fact: 'ci-passed', title: 'CI passed' });

	const comment = after.lastComment;
	const commentIsNew =
		!!comment &&
		!isMe(comment.author) &&
		!comment.authorIsBot &&
		newerThan(
			comment.createdAt,
			before?.lastComment ? Date.parse(before.lastComment.createdAt) : since
		);
	const afterMine = isMe(after.previousComment?.author);
	if (comment && commentIsNew && (mine || afterMine))
		events.push({ fact: 'replied', title: `${comment.author} replied` });
	else if (pr && mine && reviewIsNew && review.state === 'COMMENTED')
		events.push({ fact: 'replied', title: `${review.author} reviewed` });

	return events;
}

export interface ItemPush {
	reason: PushFact;
	title: string;
}

export function itemPush(
	before: SubjectFacts | null,
	after: SubjectFacts,
	mark: ItemMark | undefined,
	wanted: ReadonlySet<PushFact>,
	me: string,
	myTeams: Set<string>,
	since: number,
	now: number,
	extra: FactEvent[] = []
): ItemPush | null {
	if (mark?.updatedAt === MUTED_AT) return null;
	if (mark?.snoozeEvent) {
		const asleepNow = markState(mark, after.updatedAt, after, me, now).kind === 'snoozed';
		if (asleepNow) return null;
		const asleepBefore =
			!!before && markState(mark, before.updatedAt, before, me, now).kind === 'snoozed';
		if (asleepBefore) {
			if (!wanted.has('snooze-over')) return null;
			const outcome = snoozeOutcome(
				mark.snoozeEvent,
				enrichmentOf(after, me),
				mark.snoozedAt ?? 0,
				me
			);
			return {
				reason: 'snooze-over',
				title: outcome.wake ? `Snooze over: ${outcome.reason}` : 'Snooze over'
			};
		}
	} else if (mark && mark.snoozedUntil !== null && now < mark.snoozedUntil) return null;
	const events = [...factEvents(before, after, me, myTeams, since), ...extra].filter((e) =>
		wanted.has(e.fact)
	);
	if (!events.length) return null;
	return { reason: events[0].fact, title: events.map((e) => e.title).join(' · ') };
}
