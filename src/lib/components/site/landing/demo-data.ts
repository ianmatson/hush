import type { MockPerson } from './mock';
import type { RefSuggestion, UserSuggestion } from '$lib/shared/suggest';

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

export type DemoRole = 'opened' | 'reviews' | 'assigned' | 'involved';
export type DemoStatus =
	'no-review' | 'in-review' | 'changes' | 'approved' | 'drafts' | 'unassigned' | 'assigned';
export type DemoGroupBy = 'role' | 'status' | 'custom';

export interface DemoDashItem {
	id: string;
	title: string;
	repo: string;
	number: number;
	person: MockPerson;
	reason: string;
	tone?: 'bad' | 'stale';
	group: 'yours' | 'team' | 'waiting' | 'other';
	role: DemoRole;
	status: DemoStatus;
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

const AVATAR_DIR = '/demo-avatars';

const person = (login: string, initials: string, hue: number, avatarFile: string): MockPerson => ({
	login,
	initials,
	hue,
	avatar: `${AVATAR_DIR}/${avatarFile}`
});

export const DEMO_ME = person('ianmatson', 'IM', 256, 'ianmatson.jpg');

export const DEMO_GH = {
	nataliaAmorim: person('natalia-amorim', 'NA', 30, 'natalia-amorim.jpg'),
	cleoPleurodon: person('cleo-pleurodon', 'CL', 180, 'cleo-pleurodon.jpg'),
	rafaeelaudibert: person('rafaeelaudibert', 'RA', 150, 'rafaeelaudibert.png'),
	ivanagas: person('ivanagas', 'IV', 200, 'ivanagas.jpg'),
	charlescook: person('charlescook-ph', 'CC', 300, 'charlescook-ph.png'),
	joethreepwood: person('joethreepwood', 'JT', 90, 'joethreepwood.png'),
	rubychilds: person('rubychilds', 'RC', 0, 'rubychilds.png'),
	sarahxsanders: person('sarahxsanders', 'SS', 330, 'sarahxsanders.png'),
	brittanyjoiner: person('brittanyjoiner15', 'BJ', 120, 'brittanyjoiner15.jpg'),
	lizzieepton: person('Lizzieepton', 'LE', 60, 'lizzieepton.jpg'),
	posthogBot: person('posthog[bot]', 'PH', 40, 'posthog-bot.png'),
	dependabot: person('dependabot[bot]', 'DB', 256, 'dependabot-bot.png')
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
	author: DEMO_GH.joethreepwood,
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
		reviews: [{ who: DEMO_GH.brittanyjoiner, state: 'REQUESTED' }],
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
	author: DEMO_GH.ivanagas,
	opened: '1d ago',
	labels: ['website'],
	body: 'Add more filters to the customer stories table on /customers, and add the data for them to the existing customer stories.',
	timeline: [
		{
			who: DEMO_GH.ivanagas,
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
		reviews: [{ who: DEMO_GH.nataliaAmorim, state: 'APPROVED' }],
		checks: PREVIEW_CHECKS.map((check) => ({ ...check }))
	},
	labels: ['website'],
	body: 'Makes the pricing calculator available in blog posts as PricingCalculator. Authors choose the first products, and readers can change usage and share an estimate.',
	timeline: [{ who: DEMO_GH.nataliaAmorim, verb: 'approved', tone: 'good', text: '', ago: '25m' }],
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
		reviews: [{ who: DEMO_GH.charlescook, state: 'CHANGES_REQUESTED' }],
		checks: PREVIEW_CHECKS.map((check) => ({ ...check })),
		openThreads: 2
	},
	labels: ['website'],
	body: 'Keeps Edit profile, Cancel, and Save on the left side of the community profile window’s bottom bar, outside the scrolling form.',
	timeline: [
		{ who: DEMO_GH.charlescook, verb: 'requested changes', tone: 'bad', text: '', ago: '1h' }
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

export const DEMO_DASH: Record<'pulls' | 'issues', DemoDashItem[]> = {
	pulls: [
		{
			id: 'p-20387',
			title: 'Add Juno customer case study and cross-links',
			repo: DEMO_REPO,
			number: 20387,
			person: DEMO_GH.joethreepwood,
			reason: 'Review requested',
			group: 'yours',
			role: 'reviews',
			status: 'in-review',
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
			title: 'Add the Forum app at /forum',
			repo: DEMO_REPO,
			number: 20508,
			person: DEMO_ME,
			reason: 'CI failing',
			tone: 'bad',
			group: 'yours',
			role: 'opened',
			status: 'in-review',
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
			title: 'Add an embeddable pricing calculator for blog posts',
			repo: DEMO_REPO,
			number: 20510,
			person: DEMO_ME,
			reason: 'Ready to merge',
			group: 'yours',
			role: 'opened',
			status: 'approved',
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
			title: 'Keep community profile actions in the window bottom bar',
			repo: DEMO_REPO,
			number: 20524,
			person: DEMO_ME,
			reason: 'Changes requested',
			group: 'yours',
			role: 'opened',
			status: 'changes',
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
			person: DEMO_GH.cleoPleurodon,
			reason: 'Review for your team',
			group: 'team',
			role: 'reviews',
			status: 'in-review',
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
				DEMO_GH.cleoPleurodon,
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
			role: 'opened',
			status: 'no-review',
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
			person: DEMO_GH.sarahxsanders,
			reason: 'You approved',
			group: 'waiting',
			role: 'reviews',
			status: 'approved',
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
				DEMO_GH.sarahxsanders,
				'Four files in src/pages are components, not pages. Gatsby made a public route for each one.'
			)
		}
	],
	issues: [
		{
			id: 'i-20700',
			title:
				'Website request - Add industry, region, company size, and use case filters to customer stories',
			repo: DEMO_REPO,
			number: 20700,
			person: DEMO_GH.ivanagas,
			reason: '@ivanagas replied',
			group: 'yours',
			role: 'assigned',
			status: 'assigned',
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
			role: 'opened',
			status: 'unassigned',
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
			person: DEMO_GH.ivanagas,
			reason: 'Mentions you',
			group: 'other',
			role: 'involved',
			status: 'unassigned',
			ago: '3d',
			actionLabel: 'Open',
			url: issue(20423),
			comments: 2,
			labels: [LABEL.website],
			peek: simplePeek(
				'issue',
				'open',
				DEMO_GH.ivanagas,
				'Add the support product to the pricing page.'
			)
		}
	]
};

export const DEMO_VIEWS = [
	{ id: 'mine', name: 'Mine', groupBy: 'role' },
	{ id: 'website', name: 'Website', groupBy: 'status' }
] as const satisfies readonly { id: string; name: string; groupBy: DemoGroupBy }[];

export type DemoViewId = (typeof DEMO_VIEWS)[number]['id'];

export const inDemoView = (item: DemoDashItem, view: DemoViewId) =>
	view === 'mine' || !!item.labels?.some((l) => l.name === LABEL.website.name);

export const GROUP_BY_CHOICES: { id: DemoGroupBy; label: string }[] = [
	{ id: 'role', label: 'Your role' },
	{ id: 'status', label: 'Status' },
	{ id: 'custom', label: 'Custom sections' }
];

export const ROLE_SECTIONS: { id: DemoRole; label: string }[] = [
	{ id: 'opened', label: 'You opened' },
	{ id: 'reviews', label: 'Reviews' },
	{ id: 'assigned', label: 'Assigned to you' },
	{ id: 'involved', label: 'Involved' }
];

export const STATUS_SECTIONS: { id: DemoStatus; label: string }[] = [
	{ id: 'no-review', label: 'No review yet' },
	{ id: 'in-review', label: 'In review' },
	{ id: 'changes', label: 'Changes requested' },
	{ id: 'approved', label: 'Approved' },
	{ id: 'drafts', label: 'Drafts' },
	{ id: 'unassigned', label: 'Unassigned' },
	{ id: 'assigned', label: 'Assigned' }
];

const SMALL_LINES = 100;
const linesOf = (item: DemoDashItem) => (item.diff ? item.diff.additions + item.diff.deletions : 0);

export const CUSTOM_SECTIONS: {
	name: string;
	rule: string;
	matches: (i: DemoDashItem) => boolean;
}[] = [
	{ name: 'Failing CI', rule: 'status:failure', matches: (i) => i.ci === 'fail' },
	{
		name: 'Small',
		rule: `size:<${SMALL_LINES}`,
		matches: (i) => !!i.diff && linesOf(i) < SMALL_LINES
	}
];

export const EVERYTHING_ELSE = 'Everything else';

const REF_STATE: Partial<Record<DemoPeek['state'], RefSuggestion['state']>> = {
	open: 'open',
	draft: 'draft',
	merged: 'merged',
	closed: 'closed'
};

export const DEMO_REFS: RefSuggestion[] = [...DEMO_DASH.pulls, ...DEMO_DASH.issues].flatMap(
	(item) =>
		item.peek.kind !== 'pr' && item.peek.kind !== 'issue'
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

export const DEMO_PEOPLE: UserSuggestion[] = [DEMO_ME, ...Object.values(DEMO_GH)].map((who) => ({
	kind: 'user',
	login: who.login,
	name: null,
	avatar: who.avatar ?? null,
	team: false
}));

export interface DemoSection {
	key: string;
	label: string;
	rule?: string;
	items: DemoDashItem[];
}

export function demoSections(items: DemoDashItem[], by: DemoGroupBy): DemoSection[] {
	if (by === 'custom') {
		const named: DemoSection[] = CUSTOM_SECTIONS.map((s) => ({
			key: s.name,
			label: s.name,
			rule: s.rule,
			items: []
		}));
		const rest: DemoSection = { key: EVERYTHING_ELSE, label: EVERYTHING_ELSE, items: [] };
		for (const i of items) {
			const k = CUSTOM_SECTIONS.findIndex((s) => s.matches(i));
			(k < 0 ? rest : named[k]).items.push(i);
		}
		return [...named, rest].filter((s) => s.items.length);
	}
	const fixed = by === 'role' ? ROLE_SECTIONS : STATUS_SECTIONS;
	const valueOf = (i: DemoDashItem) => (by === 'role' ? i.role : i.status);
	return fixed
		.map((s) => ({ key: s.id, label: s.label, items: items.filter((i) => valueOf(i) === s.id) }))
		.filter((s) => s.items.length);
}
