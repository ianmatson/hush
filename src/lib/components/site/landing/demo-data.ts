import type { MockPerson } from './mock';
import type { RefSuggestion, UserSuggestion } from '$lib/shared/suggest';

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
	url: string;
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
	ago: string;
	actionLabel: string;
	url: string;
	diff?: { additions: number; deletions: number };
	comments?: number;
	ci?: 'pass' | 'fail' | 'running';
	review?: 'approved' | 'changes';
	labels?: DemoLabel[];
	peek: DemoPeek;
}

export interface DemoLabel {
	name: string;
	color: string;
}

export const DEMO_REPO = 'PostHog/posthog.com';
const REPO_URL = `https://github.com/${DEMO_REPO}`;
const pull = (n: number, tab = '') => `${REPO_URL}/pull/${n}${tab}`;
const issue = (n: number) => `${REPO_URL}/issues/${n}`;

const person = (login: string, initials: string, hue: number): MockPerson => ({
	login,
	initials,
	hue
});

export const DEMO_ME = person('ianmatson', 'IM', 256);

const GH = {
	nataliaAmorim: person('natalia-amorim', 'NA', 30),
	cleoPleurodon: person('cleo-pleurodon', 'CL', 180),
	rafaeelaudibert: person('rafaeelaudibert', 'RA', 150),
	ivanagas: person('ivanagas', 'IV', 200),
	charlescook: person('charlescook-ph', 'CC', 300),
	joethreepwood: person('joethreepwood', 'JT', 90),
	rubychilds: person('rubychilds', 'RC', 0),
	sarahxsanders: person('sarahxsanders', 'SS', 330),
	brittanyjoiner: person('brittanyjoiner15', 'BJ', 120),
	lizzieepton: person('Lizzieepton', 'LE', 60),
	posthogBot: person('posthog[bot]', 'PH', 40),
	dependabot: person('dependabot[bot]', 'DB', 256)
} satisfies Record<string, MockPerson>;

const LABEL = {
	website: { name: 'website', color: '3F0331' },
	blog: { name: 'blog', color: '7892DC' }
} satisfies Record<string, DemoLabel>;

const PREVIEW_CHECKS: DemoCheck[] = [
	{ name: 'Build & deploy preview', state: 'success' },
	{ name: 'Lint Markdown Files', state: 'success' },
	{ name: 'Spelling', state: 'success' }
];

const JUNO_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: GH.joethreepwood,
	opened: '3h ago',
	pr: {
		additions: 123,
		deletions: 1,
		files: 14,
		base: 'master',
		head: 'posthog/juno-case-study',
		reviews: [{ who: DEMO_ME, state: 'REQUESTED' }],
		checks: PREVIEW_CHECKS.map((check) => ({ ...check }))
	},
	body: 'Adds a customer case study for Juno, an AI health assistant for people who live with chronic illness, with cross-links from the customer pages.',
	timeline: [],
	main: 'approve'
};

const FORUM_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: DEMO_ME,
	opened: '5h ago',
	pr: {
		additions: 4110,
		deletions: 268,
		files: 43,
		base: 'master',
		head: 'forum-frontend',
		reviews: [{ who: GH.brittanyjoiner, state: 'REQUESTED' }],
		checks: [
			{ name: 'Build & deploy preview', state: 'failure' },
			{ name: 'Lint prose with Vale', state: 'failure' },
			{ name: 'Spelling', state: 'success' },
			{ name: 'CodeQL', state: 'success' }
		]
	},
	body: 'Adds a Forum app at /forum. The forum replaces /questions with channels, in the style of Slack or Discourse, and keeps the posts in Squeak questions.',
	timeline: [],
	main: 'rerun'
};

const FILTERS_PEEK: DemoPeek = {
	kind: 'issue',
	state: 'open',
	author: GH.ivanagas,
	opened: '1d ago',
	labels: ['website'],
	body: 'Add more filters to the customer stories table on /customers, and add the data for them to the existing customer stories.',
	timeline: [
		{
			who: GH.ivanagas,
			verb: 'commented',
			text: 'Today the table has two filters. Can we add industry, region, company size, and use case?',
			ago: '40m'
		}
	],
	main: 'none'
};

const CALCULATOR_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: DEMO_ME,
	opened: '1d ago',
	pr: {
		additions: 51,
		deletions: 10,
		files: 4,
		base: 'master',
		head: 'blog-pricing-calculator',
		reviews: [{ who: GH.nataliaAmorim, state: 'APPROVED' }],
		checks: PREVIEW_CHECKS.map((check) => ({ ...check }))
	},
	labels: ['website'],
	body: 'Makes the pricing calculator available in blog posts as PricingCalculator. Authors choose the first products, and readers can change usage and share an estimate.',
	timeline: [{ who: GH.nataliaAmorim, verb: 'approved', tone: 'good', text: '', ago: '25m' }],
	main: 'merge'
};

const PROFILE_PEEK: DemoPeek = {
	kind: 'pr',
	state: 'open',
	author: DEMO_ME,
	opened: '2d ago',
	pr: {
		additions: 32,
		deletions: 35,
		files: 1,
		base: 'master',
		head: 'fix/20365-community-profile-save',
		reviews: [{ who: GH.charlescook, state: 'CHANGES_REQUESTED' }],
		checks: PREVIEW_CHECKS.map((check) => ({ ...check })),
		openThreads: 2
	},
	labels: ['website'],
	body: 'Keeps Edit profile, Cancel, and Save on the left side of the community profile window’s bottom bar, outside the scrolling form.',
	timeline: [{ who: GH.charlescook, verb: 'requested changes', tone: 'bad', text: '', ago: '1h' }],
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
		summary: '@joethreepwood requests your review',
		repo: DEMO_REPO,
		number: 20387,
		title: 'Add Juno customer case study and cross-links',
		why: 'Review requested',
		changes: [{ text: '+2 commits' }],
		unread: true,
		ago: '3m',
		actionLabel: 'Review',
		opensTo: 'the files to review',
		url: pull(20387, '/files'),
		peek: JUNO_PEEK
	},
	{
		id: 't-ci',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'fix_ci',
		summary: 'CI failed on your PR',
		repo: DEMO_REPO,
		number: 20508,
		title: 'Add the Forum app at /forum',
		changes: [{ text: '2 checks failed', tone: 'bad' }],
		unread: true,
		ago: '12m',
		actionLabel: 'Fix CI',
		opensTo: 'the failing checks',
		url: pull(20508, '/checks'),
		peek: FORUM_PEEK
	},
	{
		id: 't-reply',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'Issue',
		kind: 'reply',
		summary: '@ivanagas replied',
		repo: DEMO_REPO,
		number: 20700,
		title:
			'Website request - Add industry, region, company size, and use case filters to customer stories',
		why: 'Assigned to you',
		unread: false,
		ago: '40m',
		actionLabel: 'Reply',
		opensTo: 'the new comment',
		url: issue(20700),
		peek: FILTERS_PEEK
	},
	{
		id: 't-merge',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'merge',
		summary: 'Ready to merge',
		repo: DEMO_REPO,
		number: 20510,
		title: 'Add an embeddable pricing calculator for blog posts',
		changes: [{ text: '@natalia-amorim approved', tone: 'good' }],
		unread: false,
		ago: '25m',
		actionLabel: 'Merge',
		opensTo: 'the merge box',
		url: pull(20510),
		peek: CALCULATOR_PEEK
	},
	{
		id: 't-changes',
		list: 'action',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'address_review',
		summary: '@charlescook-ph requested changes',
		repo: DEMO_REPO,
		number: 20524,
		title: 'Keep community profile actions in the window bottom bar',
		changes: [{ text: '2 new comments' }],
		unread: false,
		ago: '1h',
		actionLabel: 'Address',
		opensTo: 'the review comments',
		url: pull(20524, '/files'),
		peek: PROFILE_PEEK
	},
	{
		id: 't-headline',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@charlescook-ph merged it',
		repo: DEMO_REPO,
		number: 20483,
		title: 'feat(home): change hero headline to “Your product’s context layer”',
		why: 'You approved',
		unread: true,
		ago: '2h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		url: pull(20483),
		peek: simplePeek(
			'pr',
			'merged',
			GH.charlescook,
			'Changes the homepage hero headline from “Make your product self-driving” to “Your product’s context layer”.'
		)
	},
	{
		id: 't-team',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'Issue',
		kind: 'none',
		summary: 'Your team was mentioned',
		repo: DEMO_REPO,
		number: 19777,
		title: 'Forum Facelift Meta Issue: Make /questions a place builders come back to',
		why: 'Team mention',
		unread: true,
		ago: '3h',
		actionLabel: 'Open',
		opensTo: 'the issue',
		url: issue(19777),
		peek: simplePeek(
			'issue',
			'open',
			GH.brittanyjoiner,
			'A restructure of the forum at posthog.com/questions, so that it stops behaving like a public inbox.'
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
		repo: DEMO_REPO,
		number: null,
		title: 'Build & deploy preview on master',
		why: 'CI activity',
		unread: false,
		ago: '3h',
		actionLabel: 'Open',
		opensTo: 'the workflow runs',
		url: `${REPO_URL}/actions`,
		peek: simplePeek('run', 'passed', DEMO_ME, 'All 12 checks passed.')
	},
	{
		id: 't-merged',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@Lizzieepton merged it',
		repo: DEMO_REPO,
		number: 20471,
		title: 'Make the use cases headline visible in dark mode',
		why: 'You approved',
		unread: false,
		ago: '4h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		url: pull(20471),
		peek: simplePeek(
			'pr',
			'merged',
			GH.lizzieepton,
			'Adds text-primary to the headline on /context-warehouse/use-cases, so that its color follows the theme.'
		)
	},
	{
		id: 't-bot',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@posthog[bot] opened it',
		repo: DEMO_REPO,
		number: 20676,
		title: 'fix(redirects): redirect /open-positions to /careers',
		why: 'Subscribed',
		unread: false,
		ago: '5h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		url: pull(20676),
		peek: simplePeek(
			'pr',
			'open',
			GH.posthogBot,
			'Visitors who open the old /open-positions URL get a 404 page. This sends them to /careers.'
		)
	},
	{
		id: 't-bug',
		list: 'fyi',
		triage: 'inbox',
		muted: false,
		subject: 'Issue',
		kind: 'none',
		summary: 'New issue',
		repo: DEMO_REPO,
		number: 20709,
		title:
			'Bug Report: TanStack Router tile in product installation grids links to a missing docs page',
		why: 'Watching repo',
		unread: false,
		ago: '6h',
		actionLabel: 'Open',
		opensTo: 'the issue',
		url: issue(20709),
		peek: simplePeek(
			'issue',
			'open',
			GH.posthogBot,
			'The TanStack Router tile links to /docs/libraries/tanstack-router. That page does not exist.'
		)
	},
	{
		id: 't-snoozed',
		list: 'action',
		triage: 'snoozed',
		muted: false,
		subject: 'PullRequest',
		kind: 'review',
		summary: '@rubychilds requests your review',
		repo: DEMO_REPO,
		number: 20202,
		title: 'docs(handbook): explain how to test the Ashby API, replace archived channel',
		unread: false,
		ago: '1d',
		actionLabel: 'Review',
		opensTo: 'the files to review',
		snoozedLabel: 'until CI passes (or Mon 9:00)',
		url: pull(20202, '/files'),
		peek: simplePeek(
			'pr',
			'open',
			GH.rubychilds,
			'Explains how to test the Ashby API key, and replaces a reference to an archived Slack channel.'
		)
	},
	{
		id: 't-done',
		list: 'action',
		triage: 'done',
		muted: false,
		subject: 'PullRequest',
		kind: 'review',
		summary: '@rafaeelaudibert requests your review',
		repo: DEMO_REPO,
		number: 20579,
		title: 'Remove the Korean landing page and newsletter translations',
		note: 'You approved',
		unread: false,
		ago: '1d',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		url: pull(20579),
		peek: simplePeek(
			'pr',
			'merged',
			GH.rafaeelaudibert,
			'Removes the Korean landing page at /ko and the three Korean newsletter translations.'
		)
	},
	{
		id: 't-muted',
		list: 'fyi',
		triage: 'inbox',
		muted: true,
		subject: 'PullRequest',
		kind: 'none',
		summary: '@dependabot opened it',
		repo: DEMO_REPO,
		number: 20631,
		title: 'chore(deps): bump urllib3 from 2.5.0 to 2.8.0 in /scripts/hogfm',
		rule: 'Mute dependabot',
		unread: false,
		ago: '2h',
		actionLabel: 'Open',
		opensTo: 'the pull request',
		url: pull(20631),
		peek: simplePeek(
			'pr',
			'open',
			GH.dependabot,
			'Bumps urllib3 from 2.5.0 to 2.8.0 in /scripts/hogfm.'
		)
	}
];

export const DEMO_DASH: Record<'pulls' | 'issues', DemoDashItem[]> = {
	pulls: [
		{
			id: 'p-20387',
			threadId: 't-review',
			title: 'Add Juno customer case study and cross-links',
			repo: DEMO_REPO,
			number: 20387,
			person: GH.joethreepwood,
			reason: 'Review requested',
			group: 'yours',
			sections: ['Review requested'],
			ago: '3m',
			actionLabel: 'Review',
			url: pull(20387, '/files'),
			diff: { additions: 123, deletions: 1 },
			comments: 6,
			ci: 'pass',
			peek: JUNO_PEEK
		},
		{
			id: 'p-20508',
			threadId: 't-ci',
			title: 'Add the Forum app at /forum',
			repo: DEMO_REPO,
			number: 20508,
			person: DEMO_ME,
			reason: 'CI failing',
			tone: 'bad',
			group: 'yours',
			sections: ['Your PRs'],
			ago: '12m',
			actionLabel: 'Fix CI',
			url: pull(20508, '/checks'),
			diff: { additions: 4110, deletions: 268 },
			comments: 3,
			ci: 'fail',
			peek: FORUM_PEEK
		},
		{
			id: 'p-20510',
			threadId: 't-merge',
			title: 'Add an embeddable pricing calculator for blog posts',
			repo: DEMO_REPO,
			number: 20510,
			person: DEMO_ME,
			reason: 'Ready to merge',
			group: 'yours',
			sections: ['Your PRs'],
			ago: '25m',
			actionLabel: 'Merge',
			url: pull(20510),
			diff: { additions: 51, deletions: 10 },
			ci: 'pass',
			review: 'approved',
			labels: [LABEL.website],
			peek: CALCULATOR_PEEK
		},
		{
			id: 'p-20524',
			threadId: 't-changes',
			title: 'Keep community profile actions in the window bottom bar',
			repo: DEMO_REPO,
			number: 20524,
			person: DEMO_ME,
			reason: 'Changes requested',
			group: 'yours',
			sections: ['Your PRs'],
			ago: '1h',
			actionLabel: 'Address',
			url: pull(20524, '/files'),
			diff: { additions: 32, deletions: 35 },
			comments: 2,
			ci: 'pass',
			review: 'changes',
			labels: [LABEL.website],
			peek: PROFILE_PEEK
		},
		{
			id: 'p-20454',
			title: '[blog] How one runtime manages cloud agents for four PostHog products',
			repo: DEMO_REPO,
			number: 20454,
			person: GH.cleoPleurodon,
			reason: 'Review for your team',
			group: 'team',
			sections: ['Team reviews'],
			ago: '2h',
			actionLabel: 'Review',
			url: pull(20454, '/files'),
			diff: { additions: 148, deletions: 0 },
			comments: 3,
			ci: 'running',
			labels: [LABEL.blog],
			peek: simplePeek(
				'pr',
				'open',
				GH.cleoPleurodon,
				'A new blog post about how one runtime manages cloud agents for four PostHog products.'
			)
		},
		{
			id: 'p-20571',
			title: 'Replace avatar fallback with DrakeHog',
			repo: DEMO_REPO,
			number: 20571,
			person: DEMO_ME,
			reason: 'Waiting for review',
			tone: 'stale',
			group: 'waiting',
			sections: ['Your PRs'],
			ago: '5d',
			actionLabel: 'Open',
			url: pull(20571),
			diff: { additions: 2, deletions: 2 },
			ci: 'pass',
			labels: [LABEL.website],
			peek: simplePeek(
				'pr',
				'open',
				DEMO_ME,
				'Replaces the default avatar fallback, Max the hedgehog, with DrakeHog.'
			)
		},
		{
			id: 'p-20438',
			title: 'chore(pages): move components out of src/pages',
			repo: DEMO_REPO,
			number: 20438,
			person: GH.sarahxsanders,
			reason: 'You approved',
			group: 'waiting',
			sections: ['You reviewed'],
			ago: '1d',
			actionLabel: 'Open',
			url: pull(20438),
			diff: { additions: 8, deletions: 115 },
			comments: 1,
			ci: 'pass',
			review: 'approved',
			labels: [LABEL.website],
			peek: simplePeek(
				'pr',
				'open',
				GH.sarahxsanders,
				'Four files in src/pages are components, not pages. Gatsby made a public route for each one.'
			)
		}
	],
	issues: [
		{
			id: 'i-20700',
			threadId: 't-reply',
			title:
				'Website request - Add industry, region, company size, and use case filters to customer stories',
			repo: DEMO_REPO,
			number: 20700,
			person: GH.ivanagas,
			reason: '@ivanagas replied',
			group: 'yours',
			sections: ['Assigned to you'],
			ago: '40m',
			actionLabel: 'Reply',
			url: issue(20700),
			comments: 1,
			labels: [LABEL.website],
			peek: FILTERS_PEEK
		},
		{
			id: 'i-19783',
			title: 'fix /docs layout shift from searchbar and searchbar not showing before hydration',
			repo: DEMO_REPO,
			number: 19783,
			person: DEMO_ME,
			reason: 'Waiting for a reply',
			group: 'waiting',
			sections: ['You opened'],
			ago: '2d',
			actionLabel: 'Open',
			url: issue(19783),
			comments: 1,
			peek: simplePeek(
				'issue',
				'open',
				DEMO_ME,
				'The search bar on /docs moves the layout, and it does not show before hydration.'
			)
		},
		{
			id: 'i-20423',
			title: 'Website request - Add support product to pricing page',
			repo: DEMO_REPO,
			number: 20423,
			person: GH.ivanagas,
			reason: 'Mentions you',
			group: 'other',
			sections: ['Mentions you'],
			ago: '3d',
			actionLabel: 'Open',
			url: issue(20423),
			comments: 2,
			labels: [LABEL.website],
			peek: simplePeek('issue', 'open', GH.ivanagas, 'Add the support product to the pricing page.')
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

const REF_STATE: Partial<Record<DemoPeek['state'], RefSuggestion['state']>> = {
	open: 'open',
	draft: 'draft',
	merged: 'merged',
	closed: 'closed'
};

export const DEMO_REFS: RefSuggestion[] = [
	...DEMO_THREADS,
	...DEMO_DASH.pulls,
	...DEMO_DASH.issues
].flatMap((item) =>
	item.number === null || (item.peek.kind !== 'pr' && item.peek.kind !== 'issue')
		? []
		: [
				{
					kind: 'ref' as const,
					number: item.number,
					title: item.title,
					type: item.peek.kind,
					state: REF_STATE[item.peek.state] ?? 'open',
					repo: null
				}
			]
);

export const DEMO_PEOPLE: UserSuggestion[] = [DEMO_ME, ...Object.values(GH)].map((who) => ({
	kind: 'user',
	login: who.login,
	name: null,
	avatar: null,
	team: false
}));
