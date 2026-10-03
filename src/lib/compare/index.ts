import { readPage } from '$lib/docs';

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
	chooseItFor: 'A “Needs you” list sorted by whose turn it is, with push alerts'
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

const FILES = import.meta.glob('./pages/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const COMPARE: ComparePage[] = COMPARE_ORDER.map((slug) => {
	const file = `./pages/${slug}.md`;
	if (!(file in FILES))
		throw new Error(`compare: COMPARE_OVERVIEW lists ${file}, which does not exist`);
	return { slug, ...readPage(`compare: ${slug}.md`, FILES[file]) };
});
{
	const listed = new Set(COMPARE_ORDER.map((s) => `./pages/${s}.md`));
	const unlisted = Object.keys(FILES).filter((f) => !listed.has(f));
	if (unlisted.length) throw new Error(`compare: not in COMPARE_OVERVIEW: ${unlisted.join(', ')}`);
}

export const compareBySlug = (s: string) => COMPARE.find((p) => p.slug === s);
export const comparePath = (p: Pick<ComparePage, 'slug'>) => `/compare/${p.slug}`;
export const compareMarkdownPath = (p: Pick<ComparePage, 'slug'>) => `/compare/${p.slug}.md`;

const overviewRow = (o: CompareOverview, link: string) =>
	`| ${link} | ${o.kind} | ${o.price} | ${o.openSource} | ${o.chooseItFor} |`;

const OTHER_TOOLS = `- **[DevHub](https://github.com/devhubapp/devhub)**: columns of GitHub notifications and activity. Its last release was v0.102.0, in December 2020, and its last commit in September 2024.
- **[SignalBox](https://www.signalbox.sh)**: alerts for GitHub Actions, pull requests, issues, Vercel, and Linear, on the web, macOS, and iOS. You subscribe to the items you want. Closed source.
- **[Volta](https://github.com/volta-net/volta)**: an open-source (MIT) web inbox for open-source maintainers, with optional AI features. It syncs through a GitHub App.
- **[Gitmore](https://gitmore.io)**: AI summaries of a team's commits and pull requests, sent to Slack, email, or Microsoft Teams. It does not triage your own notifications.
- **[Axolo](https://axolo.co/pricing)** and **[PullFlow](https://pullflow.com/pricing)**: pull request conversations in Slack (and VS Code, for PullFlow), for teams.
- **[Meteorite](https://github.com/nickzuber/meteorite)**: a web app that scores notifications by importance. Its last commit was in March 2023.`;

export const COMPARE_INDEX: ComparePage & { path: string } = {
	slug: '',
	path: '/compare',
	title: 'GitHub notification tools compared',
	description:
		'Hush next to GitHub’s own notifications, Gitify, Octobox, Graphite, gh-dash, Neat, Notifier for GitHub, and gh-hush: what each one does well, and who should choose which.',
	markdown: `## Summary

**GitHub's own inbox is free and built in, and sorts by time. Other tools add a desktop app (Gitify, Neat), a self-hosted web inbox (Octobox), a terminal view (gh-dash), a toolbar badge (Notifier for GitHub), team code review (Graphite), or a cleanup command (gh-hush). Hush is a web app that sorts GitHub notifications by whose turn it is and pushes only what waits on you.**

Each comparison below lists where the other tool is better, where Hush is better, and its sources. We checked every fact on ${LAST_CHECKED}.

## Overview

| Tool | What it is | Price | Open source | Choose it for |
| --- | --- | --- | --- | --- |
${overviewRow(HUSH_OVERVIEW, '**Hush**')}
${COMPARE_ORDER.map((slug) => overviewRow(COMPARE_OVERVIEW[slug], `[${COMPARE_OVERVIEW[slug].name}](/compare/${slug})`)).join('\n')}

## How to choose

- **You use GitHub Enterprise Server:** GitHub's own notifications, Gitify, Octobox (self-hosted), Notifier for GitHub, or Graphite (Enterprise plan). Hush works only with github.com.
- **You want a native desktop app:** Gitify (macOS, Windows, Linux) or Neat (macOS).
- **You want nothing on a third-party server:** GitHub's own notifications, Gitify, Neat, gh-dash, Notifier for GitHub, gh-hush, or a self-hosted Octobox.
- **You work in the terminal:** gh-dash, or gh-hush to clean your inbox.
- **Your team wants a new code review flow:** Graphite.
- **You want one short list of what waits on you, with push on your phone:** Hush.

## Other tools

We did not write a full comparison for these, because they do a different job or are no longer updated:

${OTHER_TOOLS}

_Last checked: ${LAST_CHECKED}._
`
};
