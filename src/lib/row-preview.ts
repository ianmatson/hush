import type { RowMark } from './marks';
import { HOUR_MS } from './shared/durations';
import type { DashItem, DashKind } from './shared/types';

const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR_MS).toISOString();

const PREVIEW_ITEM: DashItem = {
	id: 'acme/web#128',
	kind: 'pr',
	number: 128,
	title: 'Add rate limits to the public API',
	body: 'Adds a token bucket per API key, so one client cannot slow the API for everyone. Limits come from the plan of the key.',
	url: 'https://github.com/acme/web/pull/128',
	repo: 'acme/web',
	author: 'octocat',
	authorAvatar: null,
	authorIsBot: false,
	authorAssociation: 'FIRST_TIME_CONTRIBUTOR',
	createdAt: hoursAgo(50),
	updatedAt: hoursAgo(2),
	state: 'open',
	draft: true,
	labels: [
		{ name: 'api', color: '1d76db' },
		{ name: 'backend', color: '0e8a16' },
		{ name: 'needs-docs', color: 'fbca04' }
	],
	comments: 6,
	lastHumanCommentBy: 'octocat',
	lastHumanCommentAt: hoursAgo(2),
	activity: { by: 'octocat', bot: false, what: 'commented', at: hoursAgo(2) },
	assignees: [],
	reviewRequests: ['ian'],
	ci: 'FAILURE',
	reviewDecision: 'CHANGES_REQUESTED',
	mergeable: 'CONFLICTING',
	additions: 214,
	deletions: 38,
	requestedMe: true,
	requestedTeams: [],
	requestedAt: hoursAgo(30),
	reviewRequestCount: 1,
	reviewed: false,
	myLastReviewAt: null,
	openThreads: 2,
	stackBelowNearestFirst: [],
	myLastReviewState: null,
	lastCommitAt: hoursAgo(3),
	categories: ['preview-low', 'preview-security'],
	itemId: 'PR_preview',
	revision: 1,
	baseline: {
		commits: 0,
		comments: 0,
		ci: null,
		state: 'open',
		draft: false,
		verdicts: {},
		requestedMe: true,
		labels: []
	},
	analysisStale: false,
	retained: false,
	views: ['mine'],
	retainedIn: [],
	turn: 'you',
	turnReason: 'Review requested',
	waitingSince: hoursAgo(30),
	stale: false,
	actionLabel: 'Review',
	actionUrl: 'https://github.com/acme/web/pull/128/files',
	priority: 0,
	dismissed: false,
	changes: [{ kind: 'commits', text: '2 new commits', tone: null }]
};

export function previewItem(kind: DashKind): DashItem {
	if (kind === 'pr') return PREVIEW_ITEM;
	return {
		...PREVIEW_ITEM,
		id: 'acme/web#131',
		kind: 'issue',
		number: 131,
		title: 'Login fails after the session expires',
		url: 'https://github.com/acme/web/issues/131',
		draft: false,
		ci: null,
		reviewDecision: null,
		mergeable: null,
		openThreads: 0,
		turnReason: 'Assigned to you',
		actionLabel: 'Triage',
		changes: [{ kind: 'comments', text: '3 new comments', tone: null }]
	};
}

export const PREVIEW_MARKS: RowMark[] = [
	{
		key: 'preview-low',
		name: 'Low',
		group: 'Effort',
		color: 'green',
		icon: 'lucide:timer'
	},
	{
		key: 'preview-security',
		name: 'Security',
		group: 'Topics',
		color: 'red',
		icon: 'lucide:shield'
	}
];
