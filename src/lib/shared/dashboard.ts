import { isBot } from './bots';
import type {
	ActionKind,
	DashItem,
	DashKind,
	DashSection,
	DashSettings,
	Enrichment,
	TeamDTO,
	Turn
} from './types';

export const DEFAULT_PR_SECTIONS: DashSection[] = [
	{
		id: 'review-me',
		name: 'Review requested from you',
		query: 'is:pr is:open user-review-requested:@me',
		enabled: true
	},
	{
		id: 'review-team',
		name: 'Team review requests',
		query: 'is:pr is:open team-review-requested:@team',
		enabled: true
	},
	{ id: 'mine', name: 'Your PRs', query: 'is:pr is:open author:@me', enabled: true },
	{
		id: 'reviewed',
		name: 'You reviewed',
		query: 'is:pr is:open reviewed-by:@me -author:@me',
		enabled: true
	},
	{ id: 'assigned', name: 'Assigned to you', query: 'is:pr is:open assignee:@me', enabled: true },
	{ id: 'mentioned', name: 'Mentions you', query: 'is:pr is:open mentions:@me', enabled: true },
	{
		id: 'team-mentioned',
		name: 'Mentions your teams',
		query: 'is:pr is:open team:@team',
		enabled: false
	}
];

export const DEFAULT_ISSUE_SECTIONS: DashSection[] = [
	{
		id: 'assigned',
		name: 'Assigned to you',
		query: 'is:issue is:open assignee:@me',
		enabled: true
	},
	{ id: 'mine', name: 'You opened', query: 'is:issue is:open author:@me', enabled: true },
	{ id: 'mentioned', name: 'Mentions you', query: 'is:issue is:open mentions:@me', enabled: true },
	{
		id: 'commented',
		name: 'You commented',
		query: 'is:issue is:open commenter:@me -author:@me',
		enabled: true
	},
	{
		id: 'team-mentioned',
		name: 'Mentions your teams',
		query: 'is:issue is:open team:@team',
		enabled: false
	}
];

/** The sections Hush ships. Their names only repeat a row's turn reason, so rows do not tag them. */
export const BUILT_IN_SECTIONS = new Set(
	[...DEFAULT_PR_SECTIONS, ...DEFAULT_ISSUE_SECTIONS].map((s) => s.id)
);

export const DEFAULT_DASH: DashSettings = {
	pr: DEFAULT_PR_SECTIONS,
	issue: DEFAULT_ISSUE_SECTIONS,
	scope: 'archived:false',
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
	team?: string;
	q: string;
	/** Keep only results that request a review from one of these teams ("org/team"). */
	teams?: string[];
}

/**
 * GitHub's review-requested:@me finds PRs that ask you or one of your teams (not your own PRs),
 * so one search, filtered by your tracked teams, does the work of one search per team.
 */
const TEAM_REVIEW = /\bteam-review-requested:@team\b/g;

/** Turn saved sections into concrete GitHub search strings. */
export function expandSections(
	sections: DashSection[],
	dash: Pick<DashSettings, 'scope' | 'excludedTeams'>,
	teams: TeamDTO[]
): { queries: ExpandedQuery[]; skipped: Record<string, string> } {
	const tracked = teams.filter((t) => !dash.excludedTeams.includes(t.slug));
	const queries: ExpandedQuery[] = [];
	const skipped: Record<string, string> = {};
	for (const s of sections) {
		if (!s.enabled) continue;
		const q = [s.query.trim(), dash.scope.trim()].filter(Boolean).join(' ');
		if (!q.includes('@team')) {
			queries.push({ section: s.id, q });
			continue;
		}
		if (!tracked.length) {
			skipped[s.id] = 'You are not in any tracked team.';
			continue;
		}
		const one = q.replace(TEAM_REVIEW, 'review-requested:@me');
		if (one !== q && !one.includes('@team')) {
			queries.push({ section: s.id, q: one, teams: tracked.map((t) => t.slug) });
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
	| 'autoTurn'
	| 'movedByYou'
	| 'rank'
>;

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

/** The facts the turn rules read. Dashboard items have them all; inbox threads get them from
 *  their enrichment (see turnFactsFromEnrichment). */
export type TurnFacts = Pick<
	DashFacts,
	| 'kind'
	| 'url'
	| 'author'
	| 'authorIsBot'
	| 'state'
	| 'draft'
	| 'assignees'
	| 'comments'
	| 'lastCommentBy'
	| 'lastCommentAt'
	| 'lastCommentIsBot'
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
	| 'lastVerdictBy'
	| 'lastVerdictAt'
	| 'createdAt'
	| 'updatedAt'
	| 'commentsNeedMe'
>;

export interface TurnOptions {
	/** Bots' PRs and comments never make it your turn (Settings → Inbox). */
	botsAreFyi?: boolean;
	/** "any_review": someone else's verdict after the last push settles a review request. */
	reviewResolution?: 'strict' | 'any_review';
}

const after = (a: string | null, b: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b));

/**
 * Whose move is it? The one set of rules for the inbox and the PR and issue dashboards, so an
 * item is "Needs you" exactly when it is "Your turn".
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
		!!i.lastCommentBy && !lastByMe && !(i.lastCommentIsBot && opts.botsAreFyi !== false);
	const commentNeedsNothing = lastByOtherHuman && i.commentsNeedMe === false;
	const commentWaitsOnMe = lastByOtherHuman && !commentNeedsNothing;
	const botPr = !mine && !!opts.botsAreFyi && (i.authorIsBot || isBot(i.author));
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
		if (assigned && commentWaitsOnMe)
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
		if (mine && commentWaitsOnMe)
			return you(
				`@${i.lastCommentBy} replied`,
				2,
				i.lastCommentAt,
				'Reply',
				'reply',
				`@${i.lastCommentBy} replied on your issue`
			);
		if (mine && commentNeedsNothing)
			return r('them', `@${i.lastCommentBy} replied, no reply needed`, 0, i.lastCommentAt);
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
				`${i.openThreads} open ${i.openThreads === 1 ? 'thread' : 'threads'}`,
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
		if (commentWaitsOnMe && after(i.lastCommentAt, i.lastCommitAt))
			return you(
				`@${i.lastCommentBy} commented`,
				2,
				i.lastCommentAt,
				'Reply',
				'reply',
				`@${i.lastCommentBy} commented on your PR`
			);
		if (commentNeedsNothing && after(i.lastCommentAt, i.lastCommitAt))
			return r('them', `@${i.lastCommentBy} commented, no reply needed`, 0, i.lastCommentAt);
		if (i.ci === 'PENDING' || i.ci === 'EXPECTED')
			return r('them', 'CI running', 0, i.lastCommitAt);
		return r('them', 'Waiting for review', 0, i.requestedAt || i.createdAt);
	}

	// A bot's PR is FYI, unless it asks for your review by name.
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
		updatedAt: '',
		commentsNeedMe: e.commentsNeedMe ?? null
	};
}

export function finishItem(
	facts: DashFacts,
	sections: string[],
	sectionNames: string[],
	me: string,
	staleDays: number,
	now = Date.now(),
	opts: TurnOptions = {}
): DashItem {
	// `kind` and `summary` are for the inbox; the item's own `kind` is "pr" or "issue".
	const { kind: _kind, summary: _summary, ...t } = computeTurn(facts, me, sectionNames, opts);
	const stale = t.turn !== 'none' && now - Date.parse(t.waitingSince) > staleDays * 86_400_000;
	return {
		...facts,
		...t,
		sections,
		stale,
		dismissed: false,
		autoTurn: t.turn,
		movedByYou: false,
		rank: null
	};
}

/** Server-side filters from the settings. */
export function keepItem(
	i: DashFacts,
	me: string,
	dash: Pick<DashSettings, 'hideOthersDrafts' | 'hideBots'>
): boolean {
	const mine = i.author.toLowerCase() === me.toLowerCase();
	if (dash.hideOthersDrafts && i.draft && !mine) return false;
	if (dash.hideBots && (i.authorIsBot || isBot(i.author)) && !i.requestedMe) return false;
	return true;
}

const TURN_ORDER: Record<Turn, number> = { you: 0, team: 1, them: 2, none: 3 };

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

/**
 * Order inside one turn group: new (unranked) items first in Hush's order, then your manual order.
 * `items` must already be in Hush's order (see sortItems).
 */
export function arrangeGroup<T extends Pick<DashItem, 'rank'>>(items: T[]): T[] {
	const fresh = items.filter((i) => i.rank === null);
	const ranked = items.filter((i) => i.rank !== null).sort((a, b) => a.rank! - b.rank!);
	return [...fresh, ...ranked];
}

/**
 * The full group order after a drop. `visible` is the (maybe filtered) list the user dropped into,
 * with the moved items as one block. Items hidden by a filter keep their places; the block goes
 * next to its visible neighbours.
 */
export function orderAfterDrop(full: string[], visible: string[], moved: string[]): string[] {
	const block = new Set(moved);
	const rest = full.filter((id) => !block.has(id));
	const first = visible.findIndex((id) => block.has(id));
	const last = visible.length - 1 - [...visible].reverse().findIndex((id) => block.has(id));
	const before = visible
		.slice(0, first)
		.reverse()
		.find((id) => rest.includes(id));
	const after = visible.slice(last + 1).find((id) => rest.includes(id));
	let index = 0;
	if (before !== undefined) index = rest.indexOf(before) + 1;
	else if (after !== undefined) index = rest.indexOf(after);
	rest.splice(index, 0, ...moved);
	return rest;
}

export function validateDash(d: unknown): string | null {
	if (typeof d !== 'object' || d === null) return 'Dashboard settings must be an object.';
	const x = d as Partial<DashSettings>;
	for (const kind of ['pr', 'issue'] as DashKind[]) {
		const list = x[kind];
		if (list === undefined) continue;
		if (!Array.isArray(list) || list.length > 20) return `Up to 20 ${kind} sections are allowed.`;
		const ids = new Set<string>();
		for (const s of list) {
			if (typeof s?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.id))
				return 'Each section needs a short id.';
			if (ids.has(s.id)) return `Two sections use the id "${s.id}".`;
			ids.add(s.id);
			if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 60)
				return 'Each section needs a name (60 characters or fewer).';
			if (typeof s.query !== 'string' || !s.query.trim() || s.query.length > 256)
				return `"${s.name}": the query must have 1–256 characters.`;
			if (typeof s.enabled !== 'boolean') return `"${s.name}": "enabled" must be true or false.`;
		}
	}
	if (x.scope !== undefined && (typeof x.scope !== 'string' || x.scope.length > 200))
		return 'Scope must be 200 characters or fewer.';
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
