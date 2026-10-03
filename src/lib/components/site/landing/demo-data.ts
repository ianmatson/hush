import { PEOPLE, type MockPerson } from './mock';

export type DemoKind = 'review' | 'fix_ci' | 'address_review' | 'merge' | 'reply' | 'none';
export type DemoSubject = 'PullRequest' | 'Issue' | 'Release' | 'CheckSuite' | 'Discussion';
export type DemoCheckState = 'success' | 'failure' | 'pending';
export type DemoGhAction = 'approve' | 'rerun' | 'merge' | 'none';
export type DemoTone = 'good' | 'bad';

export interface DemoCheck {
	name: string;
	state: DemoCheckState;
}

export interface DemoReview {
	who: MockPerson;
	state: 'APPROVED' | 'CHANGES_REQUESTED' | 'REQUESTED';
}

export interface DemoEntry {
	who: MockPerson;
	verb: string;
	tone?: DemoTone;
	text: string;
	ago: string;
}

export interface DemoPeek {
	kind: 'pr' | 'issue' | 'release' | 'run';
	state: 'open' | 'merged' | 'closed' | 'draft' | 'published' | 'passed';
	author: MockPerson;
	opened: string;
	pr?: {
		additions: number;
		deletions: number;
		files: number;
		base: string;
		head: string;
		reviews: DemoReview[];
		checks: DemoCheck[];
		openThreads?: number;
	};
	labels?: string[];
	body: string;
	timeline: DemoEntry[];
	main: DemoGhAction;
}

export interface DemoChange {
	text: string;
	tone?: DemoTone;
}

export interface DemoThread {
	id: string;
	list: 'action' | 'fyi';
	triage: 'inbox' | 'snoozed' | 'done';
	muted: boolean;
	subject: DemoSubject;
	kind: DemoKind;
	summary: string;
	repo: string;
	number: number | null;
	title: string;
	why?: string;
	changes?: DemoChange[];
	unread: boolean;
	ago: string;
	actionLabel: string;
	opensTo: string;
	rule?: string;
	note?: string;
	snoozedLabel?: string;
	peek: DemoPeek;
}

export interface DemoDashItem {
	id: string;
	threadId?: string;
	title: string;
	repo: string;
	number: number;
	person: MockPerson;
	reason: string;
	tone?: 'bad' | 'stale';
	group: 'yours' | 'team' | 'waiting' | 'other';
	sections: string[];
	peek: DemoPeek;
}

const ALICE_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: PEOPLE.alice,
	opened: '3h ago',
	pr: {
		additions: 84,
		deletions: 21,
		files: 4,
		base: 'main',
		head: 'alice/token-race',
		reviews: [
			{ who: PEOPLE.mei, state: 'APPROVED' },
			{ who: PEOPLE.you, state: 'REQUESTED' }
		],
		checks: [
			{ name: 'test (node 22)', state: 'success' },
			{ name: 'lint', state: 'success' },
			{ name: 'e2e / auth', state: 'success' }
		]
	},
	labels: ['bug', 'auth'],
	body: 'Two tabs could refresh the token at the same time, and the second one signed you out. This takes a short lock for each session, so only one refresh runs.',
	timeline: [
		{
			who: PEOPLE.mei,
			verb: 'approved',
			tone: 'good',
			text: 'The lock timeout matches the gateway. Ship it.',
			ago: '1h'
		}
	],
	main: 'approve'
};

const BILLING_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: PEOPLE.you,
	opened: '5h ago',
	pr: {
		additions: 212,
		deletions: 140,
		files: 9,
		base: 'main',
		head: 'you/billing-queue',
		reviews: [{ who: PEOPLE.sam, state: 'REQUESTED' }],
		checks: [
			{ name: 'test (node 22)', state: 'failure' },
			{ name: 'e2e / billing', state: 'failure' },
			{ name: 'lint', state: 'success' },
			{ name: 'typecheck', state: 'success' }
		]
	},
	body: 'Stripe webhooks now go to the queue worker, so a slow handler no longer times out the request.',
	timeline: [
		{
			who: PEOPLE.sam,
			verb: 'commented',
			text: 'Can the retry keep the original event id?',
			ago: '2h'
		}
	],
	main: 'rerun'
};

const FLICKER_PEEK: DemoPeek = {
	kind: 'issue',
	state: 'open',
	author: PEOPLE.bo,
	opened: '2d ago',
	labels: ['bug', 'search'],
	body: 'On a slow 3G profile, the results list empties and fills again on each keystroke.',
	timeline: [
		{
			who: PEOPLE.bo,
			verb: 'commented',
			text: 'Still happens on main. A recording is in the thread above. Can you take a look this week?',
			ago: '40m'
		}
	],
	main: 'none'
};

const NODE_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: PEOPLE.you,
	opened: '1d ago',
	pr: {
		additions: 6,
		deletions: 6,
		files: 3,
		base: 'main',
		head: 'you/node-22',
		reviews: [{ who: PEOPLE.mei, state: 'APPROVED' }],
		checks: [
			{ name: 'build images', state: 'success' },
			{ name: 'smoke test', state: 'success' }
		]
	},
	body: 'Moves the CI base images from Node 20 to Node 22.',
	timeline: [{ who: PEOPLE.mei, verb: 'approved', tone: 'good', text: 'Looks good.', ago: '25m' }],
	main: 'merge'
};

const RETRY_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: PEOPLE.you,
	opened: '2d ago',
	pr: {
		additions: 96,
		deletions: 12,
		files: 5,
		base: 'main',
		head: 'you/retry-budget',
		reviews: [{ who: PEOPLE.sam, state: 'CHANGES_REQUESTED' }],
		checks: [
			{ name: 'test (node 22)', state: 'success' },
			{ name: 'lint', state: 'success' }
		],
		openThreads: 3
	},
	body: 'Caps retries to the GitHub API at 10% of requests in each minute.',
	timeline: [
		{
			who: PEOPLE.sam,
			verb: 'requested changes',
			tone: 'bad',
			text: 'The budget should reset per installation, not per process.',
			ago: '1h'
		}
	],
	main: 'none'
};

function simplePeek(
	kind: DemoPeek['kind'],
	state: DemoPeek['state'],
	author: MockPerson,
	body: string
): DemoPeek {
	return { kind, state, author, opened: 'today', body, timeline: [], main: 'none' };
}

export const DEMO_THREADS: DemoThread[] = [
	{
		id: 't-review',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'review',
		summary: '@alice requests your review',
		repo: 'acme/web',
		number: 482,
		title: 'Fix token refresh race in session middleware',
		why: 'Review requested',
		changes: [{ text: '+2 commits' }],
		unread: true,
		ago: '3m',
		actionLabel: 'Review',
		opensTo: 'the files to review',
		peek: ALICE_PEEK
	},
	{
		id: 't-ci',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'fix_ci',
		summary: 'CI failed on your PR',
		repo: 'acme/api',
		number: 1291,
		title: 'Move billing webhooks to the queue worker',
		changes: [{ text: '@sam commented' }],
		unread: true,
		ago: '12m',
		actionLabel: 'Fix CI',
		opensTo: 'the failing checks',
		peek: BILLING_PEEK
	},
	{
		id: 't-reply',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'Issue',
		kind: 'reply',
		summary: '@bo replied',
		repo: 'acme/web',
		number: 477,
		title: 'Search results flicker on slow networks',
		why: 'Assigned to you',
		unread: false,
		ago: '40m',
		actionLabel: 'Reply',
		opensTo: 'the new comment',
		peek: FLICKER_PEEK
	},
	{
		id: 't-merge',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'merge',
		summary: 'Ready to merge',
		repo: 'acme/infra',
		number: 88,
		title: 'Bump Node to 22 in the CI images',
		changes: [{ text: '@mei approved', tone: 'good' }],
		unread: false,
		ago: '25m',
		actionLabel: 'Merge',
		opensTo: 'the merge box',
		peek: NODE_PEEK
	},
	{
		id: 't-changes',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'address_review',
		summary: '@sam requested changes',
		repo: 'acme/api',
		number: 1302,
		title: 'Add a retry budget to the GitHub client',
		changes: [{ text: '3 new comments' }],
		unread: false,
		ago: '1h',
		actionLabel: 'Address',
		opensTo: 'the review comments',
		peek: RETRY_PEEK
	},
	{
		id: 't-release',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'Release',
		kind: 'none',
		summary: 'Release v4.2.0',
		repo: 'acme/design',
		number: null,
		title: 'Design tokens v4.2.0',
		why: 'Watching repo',
		unread: true,
		ago: '2h',
		actionLabel: 'Open',
		opensTo: 'the release notes',
		peek: simplePeek(
			'release',
			'published',
			PEOPLE.mei,
			'New chart colors for dark mode, and a tighter type scale for tables.'
		)
	},
	{
		id: 't-team',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'Discussion',
		kind: 'none',
		summary: '@acme/web-team was mentioned',
		repo: 'acme/web',
		number: 501,
		title: 'Q4 plan for the web app',
		why: 'Team mention',
		unread: true,
		ago: '3h',
		actionLabel: 'Open',
		opensTo: 'the discussion',
		peek: simplePeek(
			'issue',
			'open',
			PEOPLE.sam,
			'A draft of the Q4 plan. Comments are open until Friday.'
		)
	},
	{
		id: 't-preview',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'CheckSuite',
		kind: 'none',
		summary: 'CI passed',
		repo: 'acme/web',
		number: null,
		title: 'Deploy preview for main',
		why: 'CI activity',
		unread: false,
		ago: '3h',
		actionLabel: 'Open',
		opensTo: 'the workflow run',
		peek: simplePeek('run', 'passed', PEOPLE.you, 'All 6 jobs passed in 4m 12s.')
	},
	{
		id: 't-merged',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@mei merged it',
		repo: 'acme/design',
		number: 61,
		title: 'Dark mode tokens for charts',
		why: 'Subscribed',
		unread: false,
		ago: '4h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		peek: simplePeek('pr', 'merged', PEOPLE.mei, 'Adds dark variants for the five chart colors.')
	},
	{
		id: 't-bot',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@dependabot opened it',
		repo: 'acme/api',
		number: 1307,
		title: 'Bump eslint from 9.11 to 9.12',
		why: 'Subscribed',
		unread: false,
		ago: '5h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		peek: simplePeek('pr', 'open', PEOPLE.dependabot, 'Bumps eslint from 9.11 to 9.12.')
	},
	{
		id: 't-typo',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'Issue',
		kind: 'none',
		summary: 'New issue',
		repo: 'acme/docs',
		number: 212,
		title: 'Typo in the getting started guide',
		why: 'Watching repo',
		unread: false,
		ago: '6h',
		actionLabel: 'Open',
		opensTo: 'the issue',
		peek: simplePeek('issue', 'open', PEOPLE.bo, '“recieve” in step 3.')
	},
	{
		id: 't-snoozed',
		list: 'action',
		triage: 'snoozed',
		muted: false,
		subject: 'PullRequest',
		kind: 'review',
		summary: '@sam requests your review',
		repo: 'acme/api',
		number: 1310,
		title: 'Cache org teams for six hours',
		unread: false,
		ago: '1d',
		actionLabel: 'Review',
		opensTo: 'the files to review',
		snoozedLabel: 'until CI passes (or Mon 9:00)',
		peek: simplePeek('pr', 'open', PEOPLE.sam, 'Caches the team list for six hours.')
	},
	{
		id: 't-done',
		list: 'action',
		triage: 'done',
		muted: false,
		subject: 'PullRequest',
		kind: 'review',
		summary: '@mei requests your review',
		repo: 'acme/web',
		number: 470,
		title: 'Upgrade Svelte to 5.40',
		note: 'You approved',
		unread: false,
		ago: '1d',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		peek: simplePeek('pr', 'merged', PEOPLE.mei, 'Upgrades Svelte and fixes two warnings.')
	},
	{
		id: 't-muted',
		list: 'fyi',
		triage: 'inbox',
		muted: true,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@dependabot opened it',
		repo: 'acme/web',
		number: 488,
		title: 'Bump vite from 7.1.3 to 7.1.4',
		rule: 'Mute dependabot on web',
		unread: false,
		ago: '2h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		peek: simplePeek('pr', 'open', PEOPLE.dependabot, 'Bumps vite from 7.1.3 to 7.1.4.')
	}
];

export const DEMO_DASH: Record<'pulls' | 'issues', DemoDashItem[]> = {
	pulls: [
		{
			id: 'p-482',
			threadId: 't-review',
			title: 'Fix token refresh race in session middleware',
			repo: 'acme/web',
			number: 482,
			person: PEOPLE.alice,
			reason: 'Review requested',
			group: 'yours',
			sections: ['Review requested'],
			peek: ALICE_PEEK
		},
		{
			id: 'p-1291',
			threadId: 't-ci',
			title: 'Move billing webhooks to the queue worker',
			repo: 'acme/api',
			number: 1291,
			person: PEOPLE.you,
			reason: 'CI failing',
			tone: 'bad',
			group: 'yours',
			sections: ['Your PRs'],
			peek: BILLING_PEEK
		},
		{
			id: 'p-88',
			threadId: 't-merge',
			title: 'Bump Node to 22 in the CI images',
			repo: 'acme/infra',
			number: 88,
			person: PEOPLE.you,
			reason: 'Ready to merge',
			group: 'yours',
			sections: ['Your PRs'],
			peek: NODE_PEEK
		},
		{
			id: 'p-1302',
			threadId: 't-changes',
			title: 'Add a retry budget to the GitHub client',
			repo: 'acme/api',
			number: 1302,
			person: PEOPLE.you,
			reason: 'Changes requested',
			group: 'yours',
			sections: ['Your PRs'],
			peek: RETRY_PEEK
		},
		{
			id: 'p-63',
			title: 'Chart legend wraps on small screens',
			repo: 'acme/design',
			number: 63,
			person: PEOPLE.mei,
			reason: 'Review for acme/web-team',
			group: 'team',
			sections: ['Team reviews'],
			peek: simplePeek('pr', 'open', PEOPLE.mei, 'Lets the legend wrap to two lines.')
		},
		{
			id: 'p-1310',
			title: 'Cache org teams for six hours',
			repo: 'acme/api',
			number: 1310,
			person: PEOPLE.you,
			reason: 'Waiting for review',
			tone: 'stale',
			group: 'waiting',
			sections: ['Your PRs'],
			peek: simplePeek('pr', 'open', PEOPLE.you, 'Caches the team list for six hours.')
		},
		{
			id: 'p-468',
			title: 'Fix the flaky login test',
			repo: 'acme/web',
			number: 468,
			person: PEOPLE.bo,
			reason: 'You approved',
			group: 'waiting',
			sections: ['You reviewed'],
			peek: simplePeek('pr', 'open', PEOPLE.bo, 'Waits for the session cookie before it clicks.')
		}
	],
	issues: [
		{
			id: 'i-477',
			threadId: 't-reply',
			title: 'Search results flicker on slow networks',
			repo: 'acme/web',
			number: 477,
			person: PEOPLE.bo,
			reason: '@bo replied',
			group: 'yours',
			sections: ['Assigned to you'],
			peek: FLICKER_PEEK
		},
		{
			id: 'i-455',
			title: 'Rate limit banner covers the header',
			repo: 'acme/web',
			number: 455,
			person: PEOPLE.you,
			reason: 'Waiting for a reply',
			group: 'waiting',
			sections: ['You opened'],
			peek: simplePeek('issue', 'open', PEOPLE.you, 'The banner sits on top of the header on iPad.')
		},
		{
			id: 'i-401',
			title: 'Dark mode for the digest email',
			repo: 'acme/web',
			number: 401,
			person: PEOPLE.sam,
			reason: 'Mentions you',
			group: 'other',
			sections: ['Mentions you'],
			peek: simplePeek(
				'issue',
				'open',
				PEOPLE.sam,
				'The digest email is hard to read in dark mode.'
			)
		}
	]
};

export const DASH_SECTIONS: Record<'pulls' | 'issues', string[]> = {
	pulls: ['Review requested', 'Team reviews', 'Your PRs', 'You reviewed'],
	issues: ['Assigned to you', 'You opened', 'Mentions you']
};

export const DASH_GROUPS = [
	{ id: 'yours', label: 'Your turn' },
	{ id: 'team', label: 'Your team’s turn' },
	{ id: 'waiting', label: 'Waiting on others' },
	{ id: 'other', label: 'Other' }
] as const;
