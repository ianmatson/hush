export interface ComparePage {
	slug: string;
	title: string;
	description: string;
	markdown: string;
}

export interface CompareOverview {
	name: string;
	kind: string;
	price: string;
	openSource: string;
	chooseItFor: string;
}

export const LAST_CHECKED = '3 October 2026';

export const HUSH_OVERVIEW: CompareOverview = {
	name: 'Hush',
	kind: 'Web app (installable), hosted',
	price: 'Free in beta; planned $3 a month',
	openSource: 'Yes',
	chooseItFor: 'Your pull requests and issues in categories, sorted by whose turn it is'
};

export const COMPARE_OVERVIEW: Record<string, CompareOverview> = {
	'github-notifications': {
		name: 'GitHub notifications',
		kind: 'github.com inbox, GitHub Mobile, email',
		price: 'Included with GitHub',
		openSource: 'No',
		chooseItFor: 'Built in; Enterprise Server; native mobile apps'
	},
	gitify: {
		name: 'Gitify',
		kind: 'Desktop app (macOS, Windows, Linux)',
		price: 'Free',
		openSource: 'Yes (MIT)',
		chooseItFor: 'A local menu bar app; several accounts; Enterprise Server'
	},
	octobox: {
		name: 'Octobox',
		kind: 'Web app, hosted or self-hosted',
		price: 'Free for open source; from $10 per user a month',
		openSource: 'Yes (AGPL-3.0)',
		chooseItFor: 'Self-hosting; rich search; an API'
	},
	graphite: {
		name: 'Graphite',
		kind: 'Code review platform (web, CLI, VS Code)',
		price: 'Free; from $20 per user a month',
		openSource: 'No',
		chooseItFor: 'Team code review, stacked PRs, merge queue'
	},
	'gh-dash': {
		name: 'gh-dash',
		kind: 'Terminal app (gh CLI extension)',
		price: 'Free',
		openSource: 'Yes (MIT)',
		chooseItFor: 'PRs, issues, and notifications in the terminal'
	},
	neat: {
		name: 'Neat',
		kind: 'macOS menu bar app',
		price: 'Free',
		openSource: 'No',
		chooseItFor: 'Mac menu bar alerts, with local data; Linear too'
	},
	'notifier-for-github': {
		name: 'Notifier for GitHub',
		kind: 'Browser extension (Chrome, Firefox)',
		price: 'Free',
		openSource: 'Yes (MIT)',
		chooseItFor: 'An unread count on the toolbar, and nothing more'
	},
	'gh-hush': {
		name: 'gh-hush',
		kind: 'Command-line tool (gh CLI extension)',
		price: 'Free',
		openSource: 'Yes (MIT)',
		chooseItFor: 'Clearing noise from GitHub’s inbox with rules, on demand'
	}
};

export const COMPARE_ORDER = Object.keys(COMPARE_OVERVIEW);

export const comparePath = (p: Pick<ComparePage, 'slug'>) => `/compare/${p.slug}`;
export const compareMarkdownPath = (p: Pick<ComparePage, 'slug'>) => `/compare/${p.slug}.md`;
