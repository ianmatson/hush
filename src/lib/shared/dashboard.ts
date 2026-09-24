import { isBot } from './classify';
import type { DashItem, DashKind, DashSection, DashSettings, TeamDTO, Turn } from './types';

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
}

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

const after = (a: string | null, b: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b));

/** Whose move is it? The core of the PR and issue views. */
export function computeTurn(i: DashFacts, me: string, sectionNames: string[]): TurnResult {
	const meL = me.toLowerCase();
	const mine = i.author.toLowerCase() === meL;
	const assigned = i.assignees.some((a) => a.toLowerCase() === meL);
	const lastByMe = i.lastCommentBy?.toLowerCase() === meL;
	const lastByOtherHuman = !!i.lastCommentBy && !lastByMe && !i.lastCommentIsBot;
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

	if (i.kind === 'issue') {
		if (assigned && lastByOtherHuman)
			return r('you', `@${i.lastCommentBy} replied`, 1, i.lastCommentAt, 'Reply');
		if (assigned) return r('you', 'Assigned to you', 3, i.createdAt);
		if (mine && lastByOtherHuman)
			return r('you', `@${i.lastCommentBy} replied`, 2, i.lastCommentAt, 'Reply');
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
			return r('you', 'CI failing', 0, i.lastCommitAt, 'Fix CI', `${i.url}/checks`);
		if (i.reviewDecision === 'CHANGES_REQUESTED')
			return r('you', 'Changes requested', 1, i.updatedAt, 'Address');
		if (i.mergeable === 'CONFLICTING') return r('you', 'Merge conflict', 1, i.updatedAt, 'Resolve');
		if (i.reviewDecision === 'APPROVED' && i.ci !== 'PENDING' && i.ci !== 'EXPECTED')
			return r('you', 'Ready to merge', 2, i.updatedAt, 'Merge');
		if (lastByOtherHuman && after(i.lastCommentAt, i.lastCommitAt))
			return r('you', `@${i.lastCommentBy} commented`, 2, i.lastCommentAt, 'Reply');
		if (i.ci === 'PENDING' || i.ci === 'EXPECTED')
			return r('them', 'CI running', 0, i.lastCommitAt);
		return r('them', 'Waiting for review', 0, i.requestedAt || i.createdAt);
	}

	if (i.requestedMe)
		return i.myLastReviewAt
			? r('you', 'Re-review requested', 0, i.requestedAt, 'Review', `${i.url}/files`)
			: r('you', 'Review requested', 0, i.requestedAt || i.createdAt, 'Review', `${i.url}/files`);
	if (assigned) return r('you', 'Assigned to you', 1, i.updatedAt);
	if (i.myLastReviewAt && after(i.lastCommitAt, i.myLastReviewAt))
		return r(
			'you',
			'New commits since your review',
			2,
			i.lastCommitAt,
			'Re-review',
			`${i.url}/files`
		);
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
	if (lastByMe) return r('them', 'Waiting for a reply', 0, i.lastCommentAt);
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
	return { ...facts, ...t, sections, stale, dismissed: false };
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
export function sortItems<T extends Pick<DashItem, 'turn' | 'waitingSince'> & { priority: number }>(
	items: T[]
): T[] {
	return [...items].sort(
		(a, b) =>
			TURN_ORDER[a.turn] - TURN_ORDER[b.turn] ||
			a.priority - b.priority ||
			Date.parse(a.waitingSince) - Date.parse(b.waitingSince)
	);
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
