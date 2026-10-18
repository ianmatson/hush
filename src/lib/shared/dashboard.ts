import { isAfter } from './activity';
import { ciFailing, ciRunning } from './ci';
import { closedLabel } from './closed-items';
import { sameLogin } from './logins';
import { readsBoard } from './projects';
import type { DashItem, DashKind, DashSection, DashSettings, TeamDTO, Turn } from './types';

export const DEFAULT_DASH: DashSettings = {
	excludedTeams: [],
	staleDays: 3,
	hideOthersDrafts: true,
	hideBots: true
};

/** GitHub allows about this many searches per GraphQL request before costs climb. */
export const MAX_QUERIES = 40;
const MAX_TEAMS_PER_SECTION = 15;

export interface ExpandedQuery {
	section: string;
	filter?: string;
	team?: string;
	q: string;
	/** Keep only results that request a review from one of these teams ("org/team"). */
	teams?: string[];
	orDirect?: boolean;
}

/**
 * GitHub's review-requested:@me finds PRs that ask you or one of your teams (not your own PRs),
 * so one search, filtered by your tracked teams, does the work of one search per team.
 */
const TEAM_REVIEW = /(?<![\w-])team-review-requested:@team\b/g;
const REVIEW_REQUESTED_ME = /(?<![\w-])review-requested:@me\b/;
const NAMES_ARCHIVED = /(?:^|\s)-?archived:/i;

const withoutArchivedRepos = (query: string) =>
	readsBoard(query) || NAMES_ARCHIVED.test(query) ? query : `${query} archived:false`;

/** Turn saved sections into concrete GitHub search strings. */
export function expandSections(
	sections: DashSection[],
	dash: Pick<DashSettings, 'excludedTeams'>,
	teams: TeamDTO[]
): { queries: ExpandedQuery[]; skipped: Record<string, string> } {
	const tracked = teams.filter((t) => !dash.excludedTeams.includes(t.slug));
	const queries: ExpandedQuery[] = [];
	const skipped: Record<string, string> = {};
	for (const s of sections) {
		const q = withoutArchivedRepos(s.query.trim());
		if (REVIEW_REQUESTED_ME.test(q) && dash.excludedTeams.length && !q.includes('@team')) {
			queries.push({
				section: s.id,
				filter: s.filter,
				q,
				teams: tracked.map((t) => t.slug),
				orDirect: true
			});
			continue;
		}
		if (!q.includes('@team')) {
			queries.push({ section: s.id, filter: s.filter, q });
			continue;
		}
		if (!tracked.length) {
			skipped[s.id] = 'You are not in any tracked team.';
			continue;
		}
		const one = q.replace(TEAM_REVIEW, 'review-requested:@me');
		if (one !== q && !one.includes('@team')) {
			queries.push({ section: s.id, filter: s.filter, q: one, teams: tracked.map((t) => t.slug) });
			continue;
		}
		const use = tracked.slice(0, MAX_TEAMS_PER_SECTION);
		if (tracked.length > use.length)
			skipped[s.id] = `Only the first ${use.length} teams are searched.`;
		for (const t of use)
			queries.push({
				section: s.id,
				filter: s.filter,
				team: t.slug,
				q: q.replaceAll('@team', t.slug)
			});
	}
	if (queries.length > MAX_QUERIES) {
		for (const q of queries.slice(MAX_QUERIES))
			skipped[q.section] ??= 'Too many searches. Track fewer teams.';
		queries.length = MAX_QUERIES;
	}
	return { queries, skipped };
}

export type DashFacts = Omit<
	DashItem,
	| 'sections'
	| 'turn'
	| 'turnReason'
	| 'waitingSince'
	| 'stale'
	| 'actionLabel'
	| 'actionUrl'
	| 'dismissed'
	| 'priority'
>;

export interface TurnResult {
	turn: Turn;
	turnReason: string;
	waitingSince: string;
	actionLabel: string;
	actionUrl: string;
	/** Lower sorts first inside a turn group. */
	priority: number;
}

export type TurnFacts = Pick<
	DashFacts,
	| 'kind'
	| 'url'
	| 'author'
	| 'authorIsBot'
	| 'state'
	| 'closedAt'
	| 'closeReason'
	| 'draft'
	| 'assignees'
	| 'comments'
	| 'lastHumanCommentBy'
	| 'lastHumanCommentAt'
	| 'ci'
	| 'reviewDecision'
	| 'mergeable'
	| 'lastCommitAt'
	| 'requestedMe'
	| 'requestedTeams'
	| 'requestedAt'
	| 'myLastReviewAt'
	| 'myLastReviewState'
	| 'openThreads'
	| 'createdAt'
	| 'updatedAt'
	| 'commentsNeedMe'
>;

export const NEW_COMMITS_REASON = 'New commits since your review';

export function computeTurn(i: TurnFacts, me: string, sectionNames: string[]): TurnResult {
	const mine = sameLogin(i.author, me);
	const assigned = i.assignees.some((a) => sameLogin(a, me));
	const commenter = i.lastHumanCommentBy;
	const commentedAt = i.lastHumanCommentAt;
	const lastByMe = sameLogin(commenter, me);
	const lastByOtherHuman = !!commenter && !lastByMe;
	const commentNeedsNothing = lastByOtherHuman && i.commentsNeedMe === false;
	const commentWaitsOnMe = lastByOtherHuman && !commentNeedsNothing;
	const botPr = !mine && i.authorIsBot;
	const r = (
		turn: Turn,
		turnReason: string,
		priority: number,
		waitingSince: string | null,
		actionLabel = 'Open',
		actionUrl = i.url
	): TurnResult => ({
		turn,
		turnReason,
		priority,
		waitingSince: waitingSince || i.updatedAt,
		actionLabel,
		actionUrl
	});
	const you = (
		turnReason: string,
		priority: number,
		waitingSince: string | null,
		actionLabel: string,
		actionUrl = i.url
	) => r('you', turnReason, priority, waitingSince, actionLabel, actionUrl);

	if (i.state === 'merged') return r('none', 'Merged', 0, i.closedAt ?? null);
	if (i.state === 'closed') return r('none', closedLabel(i.closeReason), 0, i.closedAt ?? null);

	if (i.kind === 'issue') {
		if (assigned && commentWaitsOnMe) return you(`@${commenter} replied`, 1, commentedAt, 'Reply');
		if (assigned) return you('Assigned to you', 3, i.createdAt, 'Triage');
		if (mine && commentWaitsOnMe) return you(`@${commenter} replied`, 2, commentedAt, 'Reply');
		if (mine && commentNeedsNothing)
			return r('them', `@${commenter} replied, no reply needed`, 0, commentedAt);
		if (mine)
			return r(
				'them',
				i.comments ? 'Waiting for replies' : 'No replies yet',
				0,
				commentedAt || i.createdAt
			);
		if (lastByMe) return r('them', 'Waiting for a reply', 0, commentedAt);
		return r('none', sectionNames[0] ?? 'Involves you', 0, i.updatedAt);
	}

	if (mine) {
		if (i.draft) return r('none', 'Draft', 0, i.updatedAt);
		if (ciFailing(i.ci)) return you('CI failing', 0, i.lastCommitAt, 'Fix CI', `${i.url}/checks`);
		if (i.reviewDecision === 'CHANGES_REQUESTED')
			return you('Changes requested', 1, i.updatedAt, 'Address');
		if (i.mergeable === 'CONFLICTING') return you('Merge conflict', 1, i.updatedAt, 'Resolve');
		// Approved, but a question is still open: someone waits for an answer, so this comes before
		// "Ready to merge".
		if (i.reviewDecision === 'APPROVED' && i.openThreads > 0)
			return you(
				`${i.openThreads} open ${i.openThreads === 1 ? 'thread' : 'threads'}`,
				2,
				i.updatedAt,
				'Reply'
			);
		if (i.reviewDecision === 'APPROVED' && !ciRunning(i.ci))
			return you('Ready to merge', 2, i.updatedAt, 'Merge');
		if (commentWaitsOnMe && isAfter(commentedAt, i.lastCommitAt))
			return you(`@${commenter} commented`, 2, commentedAt, 'Reply');
		if (commentNeedsNothing && isAfter(commentedAt, i.lastCommitAt))
			return r('them', `@${commenter} commented, no reply needed`, 0, commentedAt);
		if (ciRunning(i.ci)) return r('them', 'CI running', 0, i.lastCommitAt);
		return r('them', 'Waiting for review', 0, i.requestedAt || i.createdAt);
	}

	// A bot's PR is FYI, unless it asks for your review by name.
	if (botPr && !i.requestedMe) return r('none', 'Bot PR', 0, i.updatedAt);
	if (i.requestedMe)
		return i.myLastReviewAt
			? you('Re-review requested', 0, i.requestedAt, 'Review', `${i.url}/files`)
			: you('Review requested', 0, i.requestedAt || i.createdAt, 'Review', `${i.url}/files`);
	if (assigned) return you('Assigned to you', 1, i.updatedAt, 'Open');
	if (i.myLastReviewAt && isAfter(i.lastCommitAt, i.myLastReviewAt))
		return you(NEW_COMMITS_REASON, 2, i.lastCommitAt, 'Re-review', `${i.url}/files`);
	if (i.requestedTeams.length)
		return r(
			'team',
			`Review for ${i.requestedTeams[0]}`,
			0,
			i.requestedAt || i.createdAt,
			'Review',
			`${i.url}/files`
		);
	if (i.myLastReviewAt)
		return r(
			'them',
			i.myLastReviewState === 'APPROVED' ? 'You approved' : 'Waiting on author',
			0,
			i.myLastReviewAt
		);
	if (lastByMe) return r('them', 'Waiting for a reply', 0, commentedAt);
	return r('none', sectionNames[0] ?? 'Involves you', 0, i.updatedAt);
}

export function finishItem(
	facts: DashFacts,
	sections: string[],
	sectionNames: string[],
	me: string,
	staleDays: number,
	now = Date.now()
): DashItem {
	const t = computeTurn(facts, me, sectionNames);
	const stale = t.turn !== 'none' && now - Date.parse(t.waitingSince) > staleDays * 86_400_000;
	return {
		...facts,
		...t,
		sections,
		stale,
		dismissed: false
	};
}

/** Server-side filters from the settings. */
export function keepItem(
	i: DashFacts,
	me: string,
	dash: Pick<DashSettings, 'hideOthersDrafts' | 'hideBots'>
): boolean {
	const mine = sameLogin(i.author, me);
	const assignedToMe = i.assignees.some((a) => sameLogin(a, me));
	if (dash.hideOthersDrafts && i.draft && !mine) return false;
	if (dash.hideBots && i.authorIsBot && !i.requestedMe && !assignedToMe) return false;
	return true;
}

export const TURN_ORDER: Record<Turn, number> = { you: 0, team: 1, them: 2, none: 3 };

/** Your turn first; inside a group, most urgent first, then the longest wait. */
export function sortItems<
	T extends Pick<DashItem, 'turn' | 'waitingSince' | 'urgent'> & { priority: number }
>(items: T[]): T[] {
	const urgentFirst = (x: T) => (x.urgent ? 0 : 1);
	return [...items].sort(
		(a, b) =>
			TURN_ORDER[a.turn] - TURN_ORDER[b.turn] ||
			a.priority - b.priority ||
			urgentFirst(a) - urgentFirst(b) ||
			Date.parse(a.waitingSince) - Date.parse(b.waitingSince)
	);
}

export function validateDash(d: unknown): string | null {
	if (typeof d !== 'object' || d === null) return 'Dashboard settings must be an object.';
	const x = d as Partial<DashSettings>;
	if (
		x.excludedTeams !== undefined &&
		(!Array.isArray(x.excludedTeams) || x.excludedTeams.some((t) => typeof t !== 'string'))
	)
		return 'Excluded teams must be a list of "org/team" slugs.';
	if (
		x.staleDays !== undefined &&
		(!Number.isInteger(x.staleDays) || x.staleDays < 1 || x.staleDays > 60)
	)
		return 'Stale days must be a whole number from 1 to 60.';
	for (const k of ['hideOthersDrafts', 'hideBots'] as const)
		if (x[k] !== undefined && typeof x[k] !== 'boolean') return `"${k}" must be true or false.`;
	return null;
}
