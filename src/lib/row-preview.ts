import type { RowMark } from './marks';
import type { DashItem, ThreadDTO } from './shared/types';

const HOUR = 3_600_000;
const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR).toISOString();

const PREVIEW_ITEM: DashItem = {
	id: 'acme/web#128',
	kind: 'pr',
	number: 128,
	title: 'Add rate limits to the public API',
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
	lastCommentBy: 'octocat',
	lastCommentAt: hoursAgo(2),
	lastCommentIsBot: false,
	assignees: [],
	ci: 'FAILURE',
	reviewDecision: 'CHANGES_REQUESTED',
	mergeable: 'CONFLICTING',
	additions: 214,
	deletions: 38,
	requestedMe: true,
	requestedTeams: [],
	requestedAt: hoursAgo(30),
	myLastReviewAt: null,
	openThreads: 2,
	stackBelowNearestFirst: [],
	lastVerdictBy: null,
	lastVerdictAt: null,
	myLastReviewState: null,
	lastCommitAt: hoursAgo(3),
	categories: ['preview-low', 'preview-security'],
	sections: ['preview-source'],
	turn: 'you',
	turnReason: 'Review requested',
	waitingSince: hoursAgo(30),
	stale: false,
	actionLabel: 'Review',
	actionUrl: 'https://github.com/acme/web/pull/128/files',
	priority: 0,
	dismissed: false,
	autoTurn: 'you',
	movedByYou: true,
	rank: null,
	changes: [{ kind: 'commits', text: '2 new commits', tone: null }]
};

export function previewItem(kind: 'pr' | 'issue'): DashItem {
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

export const PREVIEW_SOURCE_NAMES: Record<string, string> = { 'preview-source': 'Web team' };

export const PREVIEW_THREAD: ThreadDTO = {
	id: 'preview-thread',
	repo: 'acme/web',
	subjectType: 'PullRequest',
	title: 'Add rate limits to the public API',
	reason: 'review_requested',
	unread: true,
	updatedAt: hoursAgo(2),
	htmlUrl: 'https://github.com/acme/web/pull/128',
	category: 'action',
	kind: 'review',
	summary: '@octocat asked you for a review',
	why: 'Review requested by @octocat',
	actionLabel: 'Review',
	actionUrl: 'https://github.com/acme/web/pull/128/files',
	triage: 'snoozed',
	snoozedUntil: Date.now() + 20 * HOUR,
	snoozeEvent: null,
	resolvedNote: 'Category: Web team',
	number: 128,
	state: 'open',
	draft: true,
	ci: 'FAILURE',
	author: 'octocat',
	authorIsBot: false,
	labels: ['api'],
	rule: 'Web team',
	categories: ['preview-low', 'preview-security'],
	override: true,
	changes: [{ kind: 'commits', text: '2 new commits', tone: null }],
	activity: null
};
