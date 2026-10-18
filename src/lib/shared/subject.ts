import { latestActivity, newestHumanComment } from './activity';
import type { DashFacts } from './dashboard';
import { NO_DECISIONS, type SubjectDecisions } from './decisions';
import { githubItemUrl } from './item-page';
import { requestedByName, sameLogin, type ReviewRequest } from './logins';
import { SUBJECT_TYPE } from './query';
import type {
	CiState,
	CloseReason,
	DashKind,
	Enrichment,
	LastComment,
	LatestReview,
	RuleFacts,
	StackLink
} from './types';

/**
 * Everything Hush knows about one PR or issue, as GitHub last returned it. The one record that
 * everything derives from: rules and decisions (enrichmentOf), dashboard items (dashFactsOf), and
 * pushes. Every GitHub read of a PR or issue (notification poll, dashboard search, peek, quick
 * check) stores one of these in the `subjects` table, and a change updates every view at once.
 *
 * It is per user: `myReview` is your own review, and nothing here depends on your settings or
 * teams (views apply those when they derive).
 */
export interface SubjectFacts {
	/** GraphQL node id. */
	id: string;
	kind: DashKind;
	repo: string;
	number: number;
	title: string;
	url: string;
	author: string;
	authorAvatar: string | null;
	authorIsBot: boolean;
	authorAssociation?: string | null;
	createdAt: string;
	updatedAt: string;
	state: 'open' | 'closed' | 'merged';
	closedAt?: string | null;
	closeReason?: CloseReason | null;
	draft: boolean;
	labels: { name: string; color: string }[];
	assignees: string[];
	comments: number;
	/** PRs: the number of commits (0 for issues; missing in facts stored before it existed). */
	commits?: number;
	lastComment: LastComment | null;
	previousComment?: LastComment | null;
	body?: string;
	// PRs only (empty or null for issues).
	ci: CiState | null;
	reviewDecision: Enrichment['reviewDecision'];
	mergeable: Enrichment['mergeable'] | null;
	additions: number;
	deletions: number;
	lastCommitAt: string | null;
	/** Open review requests: a user login, or a team's "org/team" slug. */
	reviewRequests: ReviewRequest[];
	/** The newest review-request events (for "waiting since"). */
	requestEvents: { at: string; team: boolean; name: string }[];
	myReview: { at: string; state: string } | null;
	latestReview: LatestReview | null;
	/** Each reviewer's latest approval or change request. */
	verdicts: { by: string; at: string; state: string }[];
	/** Review threads nobody resolved (up to 50). */
	openThreads: number;
	stackBelowNearestFirst?: StackLink[];
}

/** "owner/repo#123": the store's key. */
export const subjectKey = (repo: string, number: number) => `${repo}#${number}`;

/** Both URL forms GitHub uses for a subject (threads store either). */
export function subjectUrls(key: string): [string, string] {
	const [repo, n] = key.split('#');
	return [githubItemUrl(repo, Number(n), 'pr'), githubItemUrl(repo, Number(n), 'issue')];
}

export function reviewDecisionOf(
	s: Pick<SubjectFacts, 'reviewDecision' | 'verdicts'>
): Enrichment['reviewDecision'] {
	if (s.reviewDecision) return s.reviewDecision;
	if (s.verdicts.some((v) => v.state === 'CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
	if (s.verdicts.some((v) => v.state === 'APPROVED')) return 'APPROVED';
	return null;
}

/**
 * The newest approval or change request by someone who is neither you nor the author.
 * GitHub's `latestOpinionatedReviews` gives each reviewer's latest one.
 */
export function lastVerdictOf(s: SubjectFacts, me: string): { by: string; at: string } | null {
	const skip = new Set([me.toLowerCase(), s.author.toLowerCase()]);
	let best: { by: string; at: string } | null = null;
	for (const v of s.verdicts) {
		if (skip.has(v.by.toLowerCase())) continue;
		if (v.state !== 'APPROVED' && v.state !== 'CHANGES_REQUESTED') continue;
		if (!best || Date.parse(v.at) > Date.parse(best.at)) best = { by: v.by, at: v.at };
	}
	return best;
}

/** The facts that category rules and decisions read about a subject. */
export function enrichmentOf(
	s: SubjectFacts,
	me: string,
	decisions: SubjectDecisions = NO_DECISIONS
): Enrichment {
	const base: Enrichment = {
		kind: s.kind,
		number: s.number,
		url: s.url,
		author: s.author,
		authorIsBot: s.authorIsBot,
		labels: s.labels.map((l) => l.name),
		assignedToMe: s.assignees.some((a) => sameLogin(a, me)),
		assignees: s.assignees,
		reviewRequests: s.reviewRequests.map((r) => r.name),
		lastComment: s.lastComment,
		previousComment: s.previousComment ?? null,
		commentsNeedMe: decisions.commentsNeedMe,
		urgent: decisions.urgent,
		smart: decisions.smart,
		jevChoices: decisions.choices,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		comments: s.comments
	};
	if (s.kind === 'issue') return { ...base, state: s.state === 'closed' ? 'closed' : 'open' };
	return {
		...base,
		state: s.state,
		draft: s.draft,
		reviewDecision: reviewDecisionOf(s),
		mergeable: s.mergeable ?? undefined,
		ci: s.ci,
		lastCommitAt: s.lastCommitAt,
		openThreads: s.openThreads,
		lastVerdict: lastVerdictOf(s, me),
		myReview: s.myReview,
		latestReview: s.latestReview,
		reviewed: !!s.latestReview,
		reviewRequestedFromMe: requestedByName(s.reviewRequests, me),
		// Short slugs; turnFactsFromEnrichment adds the org back.
		requestedTeams: s.reviewRequests.filter((r) => r.team).map((r) => r.name.split('/').pop()!),
		additions: s.additions,
		deletions: s.deletions
	};
}

/** The dashboards' view of a subject. `myTeams` are the "org/team" slugs whose requests count. */
export function dashFactsOf(
	s: SubjectFacts,
	me: string,
	myTeams: Set<string>,
	decisions: SubjectDecisions = NO_DECISIONS
): DashFacts {
	const pr = s.kind === 'pr';
	const isMine = (r: ReviewRequest) => (r.team ? myTeams.has(r.name) : sameLogin(r.name, me));
	const requestedMe = requestedByName(s.reviewRequests, me);
	const requestedTeams = s.reviewRequests
		.filter((r) => r.team && myTeams.has(r.name))
		.map((r) => r.name);
	// The newest review-request event for you or one of your teams.
	const ev = [...s.requestEvents].reverse().find(isMine);
	const humanComment = newestHumanComment(s);
	return {
		id: subjectKey(s.repo, s.number),
		kind: s.kind,
		number: s.number,
		title: s.title,
		url: s.url,
		repo: s.repo,
		author: s.author,
		authorAvatar: s.authorAvatar,
		authorIsBot: s.authorIsBot,
		authorAssociation: s.authorAssociation ?? null,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		state: s.state,
		closedAt: s.closedAt ?? null,
		closeReason: s.closeReason ?? null,
		draft: s.draft,
		labels: s.labels,
		comments: s.comments,
		lastHumanCommentBy: humanComment?.author ?? null,
		lastHumanCommentAt: humanComment?.createdAt ?? null,
		activity: latestActivity(s),
		assignees: s.assignees,
		reviewRequests: s.reviewRequests.map((r) => r.name),
		ci: pr ? s.ci : null,
		reviewDecision: pr ? reviewDecisionOf(s) : null,
		mergeable: pr ? s.mergeable : null,
		additions: s.additions,
		deletions: s.deletions,
		requestedMe,
		requestedTeams,
		requestedAt: requestedMe || requestedTeams.length ? (ev?.at ?? null) : null,
		reviewRequestCount: pr ? s.reviewRequests.length : 0,
		reviewed: pr && !!s.latestReview,
		myLastReviewAt: s.myReview?.at ?? null,
		myLastReviewState: s.myReview?.state ?? null,
		openThreads: pr ? s.openThreads : 0,
		stackBelowNearestFirst: pr ? (s.stackBelowNearestFirst ?? []) : [],
		lastCommitAt: s.lastCommitAt,
		commentsNeedMe: decisions.commentsNeedMe,
		urgent: decisions.urgent
	};
}

export function ruleFactsOf(
	s: Pick<SubjectFacts, 'repo' | 'kind' | 'title'>,
	enrichment: Enrichment,
	me: string,
	context: Pick<RuleFacts, 'activity' | 'categories' | 'now'>
): RuleFacts {
	return {
		repo: s.repo,
		subjectType: SUBJECT_TYPE[s.kind],
		title: s.title,
		enrichment,
		me,
		...context
	};
}

export const subjectRuleFacts = (
	s: SubjectFacts,
	me: string,
	decisions: SubjectDecisions = NO_DECISIONS
): RuleFacts => ruleFactsOf(s, enrichmentOf(s, me, decisions), me, { activity: latestActivity(s) });
