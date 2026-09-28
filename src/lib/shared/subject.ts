import type { DashFacts } from './dashboard';
import type { CiState, Enrichment, LastComment } from './types';

/**
 * Everything Hush knows about one PR or issue, as GitHub last returned it. The one record that
 * every view derives from: inbox threads (enrichmentOf), dashboard items (dashFactsOf), and the
 * alert history. Every GitHub read of a PR or issue (poll, watcher, dashboard search, peek, quick
 * check) stores one of these in the `subjects` table, and a change updates every view at once.
 *
 * It is per user: `myReview` is your own review, and nothing here depends on your settings or
 * teams (views apply those when they derive).
 */
export interface SubjectFacts {
	/** GraphQL node id. */
	id: string;
	kind: 'pr' | 'issue';
	repo: string;
	number: number;
	title: string;
	url: string;
	author: string;
	authorAvatar: string | null;
	authorIsBot: boolean;
	createdAt: string;
	updatedAt: string;
	state: 'open' | 'closed' | 'merged';
	draft: boolean;
	labels: { name: string; color: string }[];
	assignees: string[];
	comments: number;
	lastComment: LastComment | null;
	// PRs only (empty or null for issues).
	ci: CiState | null;
	reviewDecision: Enrichment['reviewDecision'];
	mergeable: Enrichment['mergeable'] | null;
	additions: number;
	deletions: number;
	lastCommitAt: string | null;
	/** Open review requests: a user login, or a team's "org/team" slug. */
	reviewRequests: { team: boolean; name: string }[];
	/** The newest review-request events (for "waiting since"). */
	requestEvents: { at: string; team: boolean; name: string }[];
	myReview: { at: string; state: string } | null;
	latestReview: { author: string; at: string; state: string } | null;
	/** Each reviewer's latest approval or change request. */
	verdicts: { by: string; at: string; state: string }[];
	/** Review threads nobody resolved (up to 50). */
	openThreads: number;
}

/** "owner/repo#123": the store's key. */
export const subjectKey = (repo: string, number: number) => `${repo}#${number}`;

/** The key of a github.com PR or issue URL, or null. */
export function subjectKeyOfUrl(url: string): string | null {
	const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/);
	return m ? subjectKey(m[1], Number(m[2])) : null;
}

/** Both URL forms GitHub uses for a subject (threads store either). */
export function subjectUrls(key: string): [string, string] {
	const [repo, n] = key.split('#');
	return [`https://github.com/${repo}/pull/${n}`, `https://github.com/${repo}/issues/${n}`];
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

/** The inbox's view of a subject (stored on each thread, read by the classifier). */
export function enrichmentOf(s: SubjectFacts, me: string): Enrichment {
	const meL = me.toLowerCase();
	const base: Enrichment = {
		kind: s.kind,
		number: s.number,
		url: s.url,
		author: s.author,
		authorIsBot: s.authorIsBot,
		labels: s.labels.map((l) => l.name),
		assignedToMe: s.assignees.some((a) => a.toLowerCase() === meL),
		lastComment: s.lastComment
	};
	if (s.kind === 'issue') return { ...base, state: s.state === 'closed' ? 'closed' : 'open' };
	return {
		...base,
		state: s.state,
		draft: s.draft,
		reviewDecision: s.reviewDecision,
		mergeable: s.mergeable ?? undefined,
		ci: s.ci,
		lastCommitAt: s.lastCommitAt,
		openThreads: s.openThreads,
		lastVerdict: lastVerdictOf(s, me),
		myReview: s.myReview,
		latestReview: s.latestReview,
		reviewRequestedFromMe: s.reviewRequests.some((r) => !r.team && r.name.toLowerCase() === meL),
		// Short slugs; turnFactsFromEnrichment adds the org back.
		requestedTeams: s.reviewRequests.filter((r) => r.team).map((r) => r.name.split('/').pop()!),
		additions: s.additions,
		deletions: s.deletions
	};
}

/** The dashboards' view of a subject. `myTeams` are the "org/team" slugs whose requests count. */
export function dashFactsOf(s: SubjectFacts, me: string, myTeams: Set<string>): DashFacts {
	const meL = me.toLowerCase();
	const pr = s.kind === 'pr';
	const isMe = (r: { team: boolean; name: string }) => !r.team && r.name.toLowerCase() === meL;
	const isMine = (r: { team: boolean; name: string }) => isMe(r) || (r.team && myTeams.has(r.name));
	const requestedMe = s.reviewRequests.some(isMe);
	const requestedTeams = s.reviewRequests
		.filter((r) => r.team && myTeams.has(r.name))
		.map((r) => r.name);
	// The newest review-request event for you or one of your teams.
	const ev = [...s.requestEvents].reverse().find(isMine);
	const verdict = pr ? lastVerdictOf(s, me) : null;
	return {
		id: s.id,
		kind: s.kind,
		number: s.number,
		title: s.title,
		url: s.url,
		repo: s.repo,
		author: s.author,
		authorAvatar: s.authorAvatar,
		authorIsBot: s.authorIsBot,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		state: s.state,
		draft: s.draft,
		labels: s.labels,
		comments: s.comments,
		lastCommentBy: s.lastComment?.author ?? null,
		lastCommentAt: s.lastComment?.createdAt ?? null,
		lastCommentIsBot: !!s.lastComment?.authorIsBot,
		assignees: s.assignees,
		ci: pr ? s.ci : null,
		reviewDecision: pr ? s.reviewDecision : null,
		mergeable: pr ? s.mergeable : null,
		additions: s.additions,
		deletions: s.deletions,
		requestedMe,
		requestedTeams,
		requestedAt: requestedMe || requestedTeams.length ? (ev?.at ?? null) : null,
		myLastReviewAt: s.myReview?.at ?? null,
		myLastReviewState: s.myReview?.state ?? null,
		openThreads: pr ? s.openThreads : 0,
		lastVerdictBy: verdict?.by ?? null,
		lastVerdictAt: verdict?.at ?? null,
		lastCommitAt: s.lastCommitAt
	};
}
