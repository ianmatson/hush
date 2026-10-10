import { readPage } from '$lib/docs';
import {
	COMPARE_ORDER,
	COMPARE_OVERVIEW,
	HUSH_OVERVIEW,
	LAST_CHECKED,
	type CompareOverview,
	type ComparePage
} from '.';

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
	title: 'GitHub notification and pull request tools compared',
	description:
		'Hush next to GitHub’s own notifications, Gitify, Octobox, Graphite, gh-dash, Neat, Notifier for GitHub, and gh-hush: what each one does well, and who should choose which.',
	markdown: `## Summary

**GitHub's own inbox is free and built in, and sorts by time. Other tools add a desktop app (Gitify, Neat), a self-hosted web inbox (Octobox), terminal sections of pull requests and issues (gh-dash), a toolbar badge (Notifier for GitHub), team code review (Graphite), or a cleanup command (gh-hush). Hush is a web app for your GitHub work, in views that you define, with pushes for the facts that you choose.**

Most of these tools are notification inboxes. Hush is not: it reads your notifications only to learn that an item changed, and never changes them. gh-dash is the closest match, because it also builds sections from searches.

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
- **You want a notification inbox:** GitHub's own notifications, Octobox, Gitify, or Neat.
- **You want your pull requests and issues as views, with pushes for the facts you choose, also on your phone:** Hush.

## Other tools

We did not write a full comparison for these, because they do a different job or are no longer updated:

${OTHER_TOOLS}

_Last checked: ${LAST_CHECKED}._
`
};
