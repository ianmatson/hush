import { isBot } from './bots';
import type { ActionKind, CiState, Enrichment, TeamDTO, TrackedSearch, Turn } from './types';

/** GitHub allows about this many searches per GraphQL request before costs climb. */
export const MAX_QUERIES = 40;
const MAX_TEAMS_PER_SECTION = 15;

export interface ExpandedQuery {
	section: string;
	team?: string;
	q: string;
}

/** Turn tracked searches into concrete GitHub search strings. */
export function expandSearches(
	searches: TrackedSearch[],
	opts: { scope: string; excludedTeams: string[] },
	teams: TeamDTO[]
): { queries: ExpandedQuery[]; skipped: Record<string, string> } {
	const tracked = teams.filter((t) => !opts.excludedTeams.includes(t.slug));
	const queries: ExpandedQuery[] = [];
	const skipped: Record<string, string> = {};
	for (const s of searches) {
		if (!s.enabled) continue;
		const q = [s.query.trim(), opts.scope.trim()].filter(Boolean).join(' ');
		if (!q.includes('@team')) {
			queries.push({ section: s.id, q });
			continue;
		}
		if (!tracked.length) {
			skipped[s.id] = 'You are not in any tracked team.';
			continue;
		}
		const use = tracked.slice(0, MAX_TEAMS_PER_SECTION);
		if (tracked.length > use.length)
			skipped[s.id] = `Only the first ${use.length} teams are searched.`;
		for (const t of use)
			queries.push({ section: s.id, team: t.slug, q: q.replaceAll('@team', t.slug) });
	}
	if (queries.length > MAX_QUERIES) {
		for (const q of queries.slice(MAX_QUERIES))
			skipped[q.section] ??= 'Too many searches. Track fewer teams.';
		queries.length = MAX_QUERIES;
	}
	return { queries, skipped };
}

export interface TurnResult {
	turn: Turn;
	turnReason: string;
	waitingSince: string;
	actionLabel: string;
	actionUrl: string;
	/** Lower sorts first inside a turn group. */
	priority: number;
	/** What you must do, for the inbox ("none" unless it is your turn). */
	kind: ActionKind;
	/** The inbox line, e.g. "CI failed on your PR". */
	summary: string;
}

/** The facts the turn rules read, from a PR or issue (subject.ts: turnFactsOf) or an inbox thread. */
export interface TurnFacts {
	kind: 'pr' | 'issue';
	url: string;
	author: string;
	authorIsBot: boolean;
	state: 'open' | 'closed' | 'merged';
	draft: boolean;
	assignees: string[];
	comments: number;
	lastCommentBy: string | null;
	lastCommentAt: string | null;
	lastCommentIsBot: boolean;
	ci: CiState | null;
	reviewDecision: Enrichment['reviewDecision'];
	mergeable: Enrichment['mergeable'] | null;
	lastCommitAt: string | null;
	requestedMe: boolean;
	/** Your teams whose review is requested ("org/team"). */
	requestedTeams: string[];
	requestedAt: string | null;
	myLastReviewAt: string | null;
	myLastReviewState: string | null;
	openThreads: number;
	/** Newest approval or change request by someone else (not you, not the author). */
	lastVerdictBy: string | null;
	lastVerdictAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TurnOptions {
	/** Bots' PRs and comments are updates (a review request to you by name still counts). */
	botsAreUpdates?: boolean;
	/** "any_review": someone else's verdict after the last push settles a review request. */
	reviewResolution?: 'strict' | 'any_review';
}

const after = (a: string | null, b: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b));

/**
 * Whose move is it? The one set of rules for every item: a PR or issue is in Your turn exactly
 * when this says "you".
 */
export function computeTurn(
	i: TurnFacts,
	me: string,
	sectionNames: string[],
	opts: TurnOptions = {}
): TurnResult {
	const meL = me.toLowerCase();
	const mine = i.author.toLowerCase() === meL;
	const assigned = i.assignees.some((a) => a.toLowerCase() === meL);
	const lastByMe = i.lastCommentBy?.toLowerCase() === meL;
	const lastByOtherHuman =
		!!i.lastCommentBy && !lastByMe && !(i.lastCommentIsBot && opts.botsAreUpdates !== false);
	const botPr = !mine && !!opts.botsAreUpdates && (i.authorIsBot || isBot(i.author));
	const r = (
		turn: Turn,
		turnReason: string,
		priority: number,
		waitingSince: string | null,
		actionLabel = 'Open',
		actionUrl = i.url,
		kind: ActionKind = 'none',
		summary = turnReason
	): TurnResult => ({
		turn,
		turnReason,
		priority,
		waitingSince: waitingSince || i.updatedAt,
		actionLabel,
		actionUrl,
		kind,
		summary
	});
	const you = (
		turnReason: string,
		priority: number,
		waitingSince: string | null,
		actionLabel: string,
		kind: ActionKind,
		summary: string,
		actionUrl = i.url
	) => r('you', turnReason, priority, waitingSince, actionLabel, actionUrl, kind, summary);

	if (i.state === 'merged') return r('none', 'Merged', 0, i.updatedAt);
	if (i.state === 'closed') return r('none', 'Closed', 0, i.updatedAt);

	if (i.kind === 'issue') {
		if (assigned && lastByOtherHuman)
			return you(
				`@${i.lastCommentBy} replied`,
				1,
				i.lastCommentAt,
				'Reply',
				'reply',
				`@${i.lastCommentBy} replied on an issue assigned to you`
			);
		if (assigned)
			return you(
				'Assigned to you',
				3,
				i.createdAt,
				'Triage',
				'triage',
				'An issue was assigned to you'
			);
		if (mine && lastByOtherHuman)
			return you(
				`@${i.lastCommentBy} replied`,
				2,
				i.lastCommentAt,
				'Reply',
				'reply',
				`@${i.lastCommentBy} replied on your issue`
			);
		if (mine)
			return r(
				'them',
				i.comments ? 'Waiting for replies' : 'No replies yet',
				0,
				i.lastCommentAt || i.createdAt
			);
		if (lastByMe) return r('them', 'Waiting for a reply', 0, i.lastCommentAt);
		return r('none', sectionNames[0] ?? 'Involves you', 0, i.updatedAt);
	}

	if (mine) {
		if (i.draft) return r('none', 'Draft', 0, i.updatedAt);
		if (i.ci === 'FAILURE' || i.ci === 'ERROR')
			return you(
				'CI failing',
				0,
				i.lastCommitAt,
				'Fix CI',
				'fix_ci',
				'CI failed on your PR',
				`${i.url}/checks`
			);
		if (i.reviewDecision === 'CHANGES_REQUESTED')
			return you(
				'Changes requested',
				1,
				i.updatedAt,
				'Address',
				'address_review',
				'Changes requested on your PR'
			);
		if (i.mergeable === 'CONFLICTING')
			return you(
				'Merge conflict',
				1,
				i.updatedAt,
				'Resolve',
				'resolve_conflict',
				'Your PR has merge conflicts'
			);
		// Approved, but a question is still open: someone waits for an answer, so this comes before
		// "Ready to merge".
		if (i.reviewDecision === 'APPROVED' && i.openThreads > 0)
			return you(
				'Open review threads',
				2,
				i.updatedAt,
				'Reply',
				'reply',
				`Approved, but ${i.openThreads} review ${i.openThreads === 1 ? 'thread is' : 'threads are'} open`
			);
		if (i.reviewDecision === 'APPROVED' && i.ci !== 'PENDING' && i.ci !== 'EXPECTED')
			return you(
				'Ready to merge',
				2,
				i.updatedAt,
				'Merge',
				'merge',
				'Your PR is approved and ready to merge'
			);
		if (lastByOtherHuman && after(i.lastCommentAt, i.lastCommitAt))
			return you(
				`@${i.lastCommentBy} commented`,
				2,
				i.lastCommentAt,
				'Reply',
				'reply',
				`@${i.lastCommentBy} commented on your PR`
			);
		if (i.ci === 'PENDING' || i.ci === 'EXPECTED')
			return r('them', 'CI running', 0, i.lastCommitAt);
		return r('them', 'Waiting for review', 0, i.requestedAt || i.createdAt);
	}

	// Others' drafts are not ready for anyone; a bot's PR is an update, unless it asks you by name.
	if (i.draft && !i.requestedMe) return r('none', 'Draft', 0, i.updatedAt);
	if (botPr && !i.requestedMe) return r('none', 'Bot PR', 0, i.updatedAt);
	// "Any review": someone else's verdict on the latest push settles the request (yours or your
	// team's) even while GitHub still lists you.
	const settledBy =
		opts.reviewResolution === 'any_review' &&
		(i.requestedMe || i.requestedTeams.length) &&
		i.lastVerdictBy &&
		after(i.lastVerdictAt, i.lastCommitAt)
			? i.lastVerdictBy
			: null;
	if (settledBy) return r('them', `@${settledBy} reviewed`, 0, i.lastVerdictAt);
	if (i.requestedMe)
		return i.myLastReviewAt
			? you(
					'Re-review requested',
					0,
					i.requestedAt,
					'Review',
					'review',
					`@${i.author} requests your re-review`,
					`${i.url}/files`
				)
			: you(
					'Review requested',
					0,
					i.requestedAt || i.createdAt,
					'Review',
					'review',
					`@${i.author} requests your review`,
					`${i.url}/files`
				);
	if (assigned)
		return you('Assigned to you', 1, i.updatedAt, 'Open', 'triage', 'A PR was assigned to you');
	if (i.myLastReviewAt && after(i.lastCommitAt, i.myLastReviewAt))
		return you(
			'New commits since your review',
			2,
			i.lastCommitAt,
			'Re-review',
			'review',
			'New commits since your review',
			`${i.url}/files`
		);
	if (i.requestedTeams.length)
		return r(
			'team',
			`Review for ${i.requestedTeams[0]}`,
			0,
			i.requestedAt || i.createdAt,
			'Review',
			`${i.url}/files`,
			'review',
			`@${i.author} requests review from ${i.requestedTeams[0]}`
		);
	if (i.myLastReviewAt)
		return r(
			'them',
			i.myLastReviewState === 'APPROVED' ? 'You approved' : 'Waiting on author',
			0,
			i.myLastReviewAt
		);
	if (lastByMe) return r('them', 'Waiting for a reply', 0, i.lastCommentAt);
	return r('none', sectionNames[0] ?? 'Involves you', 0, i.updatedAt);
}

/**
 * Turn facts for an inbox thread. `myTeams` are "org/team" slugs; only requests for those count.
 * Threads have no creation or update times here; they only affect dashboard sorting.
 */
export function turnFactsFromEnrichment(
	e: Enrichment,
	repo: string,
	me: string,
	myTeams: string[] = []
): TurnFacts {
	const org = repo.split('/')[0];
	return {
		kind: e.kind === 'issue' ? 'issue' : 'pr',
		url: e.url ?? '',
		author: e.author ?? 'ghost',
		authorIsBot: !!e.authorIsBot,
		state: e.state ?? 'open',
		draft: !!e.draft,
		assignees: e.assignedToMe ? [me] : [],
		comments: e.lastComment ? 1 : 0,
		lastCommentBy: e.lastComment?.author ?? null,
		lastCommentAt: e.lastComment?.createdAt ?? null,
		lastCommentIsBot: !!e.lastComment?.authorIsBot,
		ci: e.ci ?? null,
		reviewDecision: e.reviewDecision ?? null,
		mergeable: e.mergeable ?? null,
		lastCommitAt: e.lastCommitAt ?? null,
		requestedMe: !!e.reviewRequestedFromMe,
		requestedTeams: (e.requestedTeams ?? [])
			.map((slug) => `${org}/${slug}`)
			.filter((slug) => myTeams.includes(slug)),
		requestedAt: null,
		myLastReviewAt: e.myReview?.at ?? null,
		myLastReviewState: e.myReview?.state ?? null,
		openThreads: e.openThreads ?? 0,
		lastVerdictBy: e.lastVerdict?.by ?? null,
		lastVerdictAt: e.lastVerdict?.at ?? null,
		createdAt: '',
		updatedAt: ''
	};
}
