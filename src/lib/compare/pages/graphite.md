---
title: Hush vs. Graphite for pull requests and GitHub notifications
description: Graphite's pull request inbox next to Hush. Graphite is a full code review platform for teams; Hush is a web app for one person's GitHub pull requests and issues, in views you define, with pushes for the facts you choose. Who should use which.
---

## Summary

**Graphite is a code review platform for teams: stacked pull requests, a pull request inbox, a full review page, a merge queue, AI review, and Slack alerts. Hush is for one person: your GitHub pull requests and issues, in views that you define, with pushes for the facts that you choose.**

- Choose Graphite if your team wants to change how it writes, reviews, and merges pull requests.
- Choose Hush if you want your pull requests and issues as views across all your repositories, with pushes for the facts that you choose, and you review on GitHub or in Hush.
- The two can work together: Graphite for the review, and Hush for your views and pushes. Hush shows a Graphite stack as one row.

## At a glance

|                          | Graphite                                                                                                             | Hush                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| What it is               | Code review platform (pull requests)                                                                                 | Views of pull requests and issues, with pushes                                                |
| Where it runs            | Web app, CLI, VS Code extension, MCP, macOS menu bar app                                                             | Web app (installable), on Cloudflare                                                          |
| Price                    | Hobby free; Starter $20 and Team $40 per user per month, billed yearly; Enterprise custom                            | Free in beta; planned $3 a month or $30 a year                                                |
| Open source              | No                                                                                                                   | Yes (AGPL-3.0)                                                                                |
| Covers                   | Pull requests in your chosen repositories                                                                            | Pull requests and issues that your searches find, in any repository you can see               |
| Inbox sections           | Needs your review, Approved, Returned to you, Merging and recently merged, Drafts, Waiting for review, plus your own | Group by role, status, repository, author, label, category, project status, or your own rules |
| Code review              | Full diff, comments, approve, merge, stacks, merge queue (Team plan and up), AI review                               | Diff and line comments, approve, comment, merge, auto-merge, re-run CI; no merge queue        |
| Alerts                   | In-app; Slack (Starter plan and up)                                                                                  | Push for the facts that you choose; Web Push and Slack direct messages; Atom feeds            |
| GitHub Enterprise Server | Enterprise plan only                                                                                                 | No                                                                                            |
| Team features            | Insights, automations, shared inbox sections, ACLs, SAML (by plan)                                                   | Team review requests and `@team` searches only                                                |

## What each one is for

**Graphite** replaces much of the GitHub pull request page. Its inbox lists the pull requests in your default repositories (up to 3 on the free plan, up to 30 on Team and Enterprise) in sections you can change and share with teammates. Its review page shows the diff, and you can comment, approve, and merge. It adds stacked pull requests through its CLI, a merge queue, automations, and AI review. Graphite does not document issues, discussions, releases, or other GitHub notifications in its inbox.

**Hush** shows the open pull requests and issues that the searches of your [views](/docs/views) find, across all repositories it can see. A search can use Hush words, such as `size:<50` or `repo:acme/*` (see [the query language](/docs/query-language#in-a-views-search)). Each view has its own [Group by](/docs/pull-requests-and-issues#group-by), or its own [custom sections](/docs/pull-requests-and-issues#custom-sections) with a rule each. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), and a stack of pull requests shows as one row. The [peek](/docs/peek) lets you approve, request changes, comment, merge, close, and re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review.

## Alerts

**Graphite** has in-app notifications on every plan. From the Starter plan, it sends Slack alerts for review requests, comments, mentions, and status changes, and you can review pull requests of up to 25 lines from Slack. Browser push and a mobile app are not documented.

**Hush** pushes the [facts that you choose](/docs/notifications#what-gets-pushed), such as a review request, a mention, a reply, or failed CI on your pull request. Each view can also push its new items. Pushes go to desktop and phone browsers, and to Slack as direct messages, with [quiet hours, digests, and limits](/docs/notifications#how-often). You cannot review from Slack. Hush also has [Atom feeds](/docs/feeds) for each view.

## Company, hosting, and privacy

**Graphite** is a hosted service. In December 2025 it agreed to be acquired by Cursor, which said Graphite will continue to operate independently with the same team and product. Graphite is SOC 2 Type II compliant. Its GitHub App asks for read and write access to contents, pull requests, checks, actions, and workflows. GitHub Enterprise Server works only on the Enterprise plan, set up with Graphite's support team; there is no self-hosted Graphite.

**Hush** is a small open-source service on Cloudflare. It asks for the classic `notifications`, `repo`, `read:org`, and `project` scopes, because GitHub's Notifications API accepts only classic scopes. It reads your notifications only to learn that an item changed, and never changes them. It writes to GitHub only when you act. See [GitHub access](/docs/github-access) and [Privacy](/privacy).

## Where Graphite is better

- A full code review platform: stacked pull requests through its CLI, a merge queue, and AI review.
- Team features: insights, automations, shared inbox sections, admin controls, SAML.
- Slack alerts with review and merge from Slack.
- Support for GitHub Enterprise Server on its Enterprise plan, and a SOC 2 Type II report.
- A larger company and a mature product; Cursor says it is "used by hundreds of thousands of engineers". Hush is in beta.

## Where Hush is better

- It covers issues too, not only pull requests.
- Views from your own searches, across all repositories you can see, with no limit on default repositories.
- Push alerts on desktop and phone for the facts that you choose, with quiet hours and digests.
- Categories that sort pull requests and issues by your rules, or by Jev.
- One low price for one person; no team purchase is needed.
- Open source.

## Choose Graphite if…

- Your team wants stacked pull requests, a merge queue, or AI review.
- You review many pull requests and want a better review page than GitHub's.
- You want your team's alerts in Slack, with review from Slack.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You want push alerts on your phone, not only in Slack.
- You work alone or in many repositories, and do not need a team platform.

## Sources

- [Graphite pricing](https://graphite.com/pricing): plans and prices
- [Pull request inbox](https://graphite.com/docs/use-pr-inbox), Graphite docs
- [Slack notifications](https://graphite.com/docs/slack-notifications), Graphite docs
- [Menu bar app (Mac)](https://graphite.com/docs/menu-bar-app), Graphite docs
- [GitHub Enterprise Server](https://graphite.com/docs/github-enterprise-server), Graphite docs
- [Privacy and security](https://graphite.com/docs/privacy-and-security), Graphite docs
- [Graphite is joining Cursor](https://cursor.com/blog/graphite), Cursor blog, 19 December 2025
- Hush: [pull requests and issues](/docs/pull-requests-and-issues), [peek](/docs/peek), [notifications](/docs/notifications), [pricing](/pricing)

_Last checked: 3 October 2026._
