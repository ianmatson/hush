---
title: Hush vs. Graphite for GitHub notifications
description: Graphite's pull request inbox next to Hush for GitHub notifications. Graphite is a full code review platform for teams; Hush is a notification inbox for one person. Who should use which.
---

## Summary

**Graphite is a code review platform for teams: stacked pull requests, a pull request inbox, a full review page, a merge queue, AI review, and Slack alerts. Hush is a GitHub notification inbox for one person: it tracks the pull requests and issues that your saved searches find, sorts their notifications by whose turn it is, and pushes what waits on you.**

- Choose Graphite if your team wants to change how it writes, reviews, and merges pull requests.
- Choose Hush if you want your GitHub notifications about pull requests and issues sorted, with push alerts, and you review on GitHub itself.
- The two can work together: Graphite for the review, Hush for the rest of the inbox.

## At a glance

|                          | Graphite                                                                                                             | Hush                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| What it is               | Code review platform (pull requests)                                                                                 | Notification inbox (all GitHub notifications)                         |
| Where it runs            | Web app, CLI, VS Code extension, MCP, macOS menu bar app                                                             | Web app (installable), on Cloudflare                                  |
| Price                    | Hobby free; Starter $20 and Team $40 per user per month, billed yearly; Enterprise custom                            | Free in beta; planned $3 a month or $30 a year                        |
| Open source              | No                                                                                                                   | Yes                                                                   |
| Covers                   | Pull requests in your chosen repositories                                                                            | Notifications about tracked pull requests and issues, plus dashboards |
| Inbox sections           | Needs your review, Approved, Returned to you, Merging and recently merged, Drafts, Waiting for review, plus your own | Needs you, FYI, Muted; Your turn, Your team's turn, Waiting on others |
| Code review              | Full diff, comments, approve, merge, stacks, merge queue (Team plan and up), AI review                               | Approve, comment, merge, close, re-run CI; no diff                    |
| Alerts                   | In-app; Slack (Starter plan and up)                                                                                  | Web Push with quiet hours and digests; Atom feeds                     |
| GitHub Enterprise Server | Enterprise plan only                                                                                                 | No                                                                    |
| Team features            | Insights, automations, shared inbox sections, ACLs, SAML (by plan)                                                   | Team review requests and `@team` sources only                         |

## What each one is for

**Graphite** replaces much of the GitHub pull request page. Its inbox lists the pull requests in your default repositories (up to 3 on the free plan, up to 30 on Team and Enterprise) in sections you can change and share with teammates. Its review page shows the diff, and you can comment, approve, and merge. It adds stacked pull requests through its CLI, a merge queue, automations, and AI review. Graphite does not document issues, discussions, releases, or other GitHub notifications in its inbox.

**Hush** is about the notification inbox. It tracks the pull requests and issues that your saved GitHub searches find, reads your notifications about them and the facts of each item, and decides if you are the next person who must act. It has [Pull requests and Issues tabs](/docs/pull-requests-and-issues) grouped by whose turn it is, across all repositories it can see. The [peek](/docs/peek) lets you approve, request changes, comment, merge, close, and re-run failed jobs, but you read the code on GitHub.

## Alerts

**Graphite** has in-app notifications on every plan. From the Starter plan, it sends Slack alerts for review requests, comments, mentions, and status changes, and you can review pull requests of up to 25 lines from Slack. Browser push and a mobile app are not documented.

**Hush** sends Web Push to desktop and phone browsers, by default only for "Needs you", with [quiet hours, digests, and limits](/docs/notifications). It does not send to Slack, but its [Atom feeds](/docs/feeds) work with a Slack feed app.

## Company, hosting, and privacy

**Graphite** is a hosted service. In December 2025 it agreed to be acquired by Cursor, which said Graphite will continue to operate independently with the same team and product. Graphite is SOC 2 Type II compliant. Its GitHub App asks for read and write access to contents, pull requests, checks, actions, and workflows. GitHub Enterprise Server works only on the Enterprise plan, set up with Graphite's support team; there is no self-hosted Graphite.

**Hush** is a small open-source service on Cloudflare. It asks for the classic `notifications`, `repo`, and `read:org` scopes, because GitHub's Notifications API accepts only those. It does not read code. See [GitHub access](/docs/github-access) and [Privacy](/privacy).

## Where Graphite is better

- A full code review tool: diffs, line comments, stacked pull requests, a merge queue, and AI review.
- Team features: insights, automations, shared inbox sections, admin controls, SAML.
- Slack alerts with review and merge from Slack.
- Support for GitHub Enterprise Server on its Enterprise plan, and a SOC 2 Type II report.
- A larger company and a mature product; Cursor says it is "used by hundreds of thousands of engineers". Hush is in beta.

## Where Hush is better

- It covers issues too, not only pull requests, with the notifications about them: mentions, review requests, CI on your pull requests, and replies.
- It works across all repositories you can see, with no limit on default repositories.
- Push alerts on desktop and phone, with quiet hours and digests.
- One low price for one person; no team purchase is needed.
- Open source, with narrower GitHub access (no write access to code).

## Choose Graphite if…

- Your team wants stacked pull requests, a merge queue, or AI review.
- You review many pull requests and want a better review page than GitHub's.
- You want your team's alerts in Slack.

## Choose Hush if…

- You want one inbox for everything GitHub sends you, sorted by whose turn it is.
- You want push alerts on your phone, not only in Slack.
- You use GitHub's own pull request page and only need help to know what waits on you.

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
