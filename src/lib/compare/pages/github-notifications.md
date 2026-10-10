---
title: Hush vs. GitHub notifications (the built-in inbox)
description: GitHub notifications in the github.com inbox and GitHub Mobile, next to Hush: what each one shows, what each one pushes, and who should use which.
---

## Summary

**GitHub's own inbox is free, built in, and works on every GitHub plan, including Enterprise Server, with native mobile apps. Hush is not a notification inbox: it shows your GitHub pull requests and issues in views that you define, and pushes the facts that you choose. It reads your notifications only as a signal, and never changes them.**

- Choose GitHub's inbox if you want a notification inbox: every type of notification, sorted by time, with filters. It is also the choice for GitHub Enterprise Server, or for an app from GitHub itself.
- Choose Hush if you want your pull requests and issues as views, with pushes for the facts that you choose.
- You can use both. Hush never marks a notification read or done, so GitHub's inbox stays as you left it.

## At a glance

|                          | GitHub notifications                                                                      | Hush                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Where it runs            | github.com, GitHub Mobile (iOS, Android), email                                           | Web app (installable), on Cloudflare                                                      |
| Price                    | Included with GitHub                                                                      | Free in beta; planned $3 a month or $30 a year                                            |
| Open source              | No                                                                                        | Yes (AGPL-3.0)                                                                            |
| What it lists            | Notifications of every type                                                               | Open pull requests and issues that your searches find, also with no notification          |
| Sort order               | Time (newest or oldest first); group by repository                                        | Sections by your role, review status, repository, category, project status, or your rules |
| Filters                  | `reason:`, `is:`, `repo:`, `author:`, `org:`; up to 15 custom filters                     | A query language; up to 12 views of up to 5 searches each                                 |
| Push                     | GitHub Mobile: mentions, assignments, review requests, deployment approvals, Actions runs | The facts that you choose, and new items in a view; Web Push and Slack                    |
| Review a PR              | Yes, with the full diff (web and Mobile)                                                  | Diff and line comments on the full page; approve, merge, and re-run CI in the peek        |
| GitHub Enterprise Server | Yes                                                                                       | No (github.com only)                                                                      |
| Several accounts         | Yes, in GitHub Mobile                                                                     | No (one GitHub account per Hush account)                                                  |
| How fast                 | At once                                                                                   | Reads notifications every 5 minutes; finds changes with no notification within about 15   |
| History kept             | Web notifications for 3 months; saved ones without a limit                                | Alert history for 30 days                                                                 |

## What each one shows

**GitHub** lists notifications by time. Since April 2026 you can sort newest first or oldest first, and group by repository. Filters use the reason GitHub gives (`reason:review-requested`, `reason:mention`, `reason:ci-activity`, and more), the type, the repository, the author, and the org. Default filters show assigned, participating, review requested, and @mentioned threads. You can save up to 15 custom filters. Filters cannot search the text of titles.

The reason that GitHub gives is fixed when the notification arrives. A thread with `reason:review-requested` keeps that reason after you review, and a thread with `reason:subscribed` does not say that CI failed on your pull request.

**Hush** shows the open pull requests and issues that the searches of your [views](/docs/views) find. A search can use GitHub words and Hush words, such as `size:<50` or `repo:acme/*` (see [the query language](/docs/query-language#in-a-views-search)). Each view puts its items into sections with [Group by](/docs/pull-requests-and-issues#group-by), or into [custom sections](/docs/pull-requests-and-issues#custom-sections) with a rule each. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), from CI, reviews, review requests, and comments.

Hush reads your notifications only to learn quickly that an item changed. It does not list them, and it never changes them on GitHub. Releases, CI runs, discussions, and security alerts stay on GitHub. [Categories](/docs/categories) sort your pull requests and issues, for example by review effort or impact.

## Pull requests and reviews

**GitHub** is the full tool. You read the diff, comment on lines, and submit reviews on github.com and in GitHub Mobile. Since July 2026, the pull requests dashboard at github.com/pulls has an inbox of review requests, pull requests that need a fix, and pull requests that are ready to merge, with saved views and `AND`/`OR` search. It covers pull requests, not issues or other notifications.

**Hush** has [views](/docs/views) of pull requests and issues, with a switch for Pull requests, Issues, or Both. The [peek](/docs/peek) shows the description, comments, reviews, and checks. From it you approve, request changes, comment, react, merge, turn on auto-merge, close, and re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review.

## Push and alerts

**GitHub Mobile** pushes direct mentions, assignments, review requests, and deployment approvals, each with its own switch. It can also push GitHub Actions workflow runs that you started, with an option for failed runs only. On iOS you can set working hours for pushes. Email can go to a different address for each organization, and has headers that a mail filter can use. GitHub does not document browser push for the web inbox.

**Hush** pushes facts, not notifications. You choose [which facts push](/docs/notifications#what-gets-pushed): your review is requested, you are mentioned, someone replies, your pull request is approved or gets changes requested, CI fails or passes, you are assigned, or a snooze ends. Each view can also push its new items. Pushes go as Web Push to browsers and installed web apps on desktop and Android, and on iPhone or iPad only from a Home Screen web app (iOS 16.4 or later). They can also go to Slack as direct messages. Hush has [quiet hours, digests, a limit, and one alert per pull request](/docs/notifications#how-often), an alert history for 30 days, and private [Atom feeds](/docs/feeds) for each view.

## Accounts, Enterprise, and privacy

**GitHub** works everywhere GitHub runs. GitHub Mobile can sign in to github.com, GHE.com, and GitHub Enterprise Server accounts at the same time. Your data stays with GitHub.

**Hush** works only with github.com, and one Hush account has one GitHub account. It is a third party: it stores your encrypted token and the facts of each pull request and issue (see [Privacy](/privacy)). An org that limits OAuth apps hides its private repositories from Hush until an owner approves it, or until you give Hush [a custom token](/docs/github-access#custom-token).

## Where GitHub is better

- It is built in and free, and nothing else gets access to your account.
- It works with GitHub Enterprise Server and GHE.com, and with several accounts in one app.
- Native iOS and Android apps, with push that needs no install step.
- It is complete at once; Hush waits up to 5 minutes for its next check.
- It shows every type of notification, also releases, CI runs, discussions, and security alerts.
- It is mature and maintained by GitHub. Hush is in beta.

## Where Hush is better

- Views of your pull requests and issues from searches that you write, also for items that sent no notification.
- Hush words in searches, such as `size:<50` and `repo:acme/*`, and sections by role, status, category, project status, or your own rules.
- Each row says whose turn it is, and keeps that up to date as the pull request changes.
- Push for exactly the facts that you choose, with quiet hours, digests, and limits, on any device with a modern browser, or in Slack.
- Snooze for a time, or until something happens (for example, until CI passes).
- Categories sort pull requests and issues by your rules, or by Jev, for example by review effort.

## Choose GitHub if…

- You use GitHub Enterprise Server, GHE.com, or more than one account.
- You want native mobile apps, or you do not want to give a third party access.
- You want a notification inbox with every type of notification, and a time-sorted list works for you.

## Choose Hush if…

- You work on github.com, and you want your pull requests and issues as views, with pushes for the facts that you choose.
- You want sections and pushes that you control, not the reason that GitHub gave.
- You want categories and snoozes that GitHub does not have.

## Sources

- [About notifications](https://docs.github.com/en/subscriptions-and-notifications/concepts/about-notifications), GitHub Docs
- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications), GitHub Docs
- [Inbox filters](https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters), GitHub Docs
- [Managing notifications from your inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox), GitHub Docs
- [GitHub Mobile](https://docs.github.com/en/get-started/using-github/github-mobile), GitHub Docs
- [Push Notifications for Actions on Mobile](https://github.blog/changelog/2023-01-17-push-notifications-for-actions-on-mobile/), GitHub Changelog, 17 January 2023
- [New Sort by control added to notifications](https://github.blog/changelog/2026-04-09-new-sort-by-control-added-to-notifications/), GitHub Changelog, 9 April 2026
- [Changes to notification retention and archived repository watches](https://github.blog/changelog/2026-04-24-changes-to-notification-retention-and-archived-repository-watches/), GitHub Changelog, 24 April 2026
- [New pull requests dashboard is now generally available](https://github.blog/changelog/2026-07-09-new-pull-requests-dashboard-is-now-generally-available/), GitHub Changelog, 9 July 2026
- Hush: [docs](/docs), [views](/docs/views), [notifications](/docs/notifications), [limits](/docs/limits), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
