---
title: Hush vs. GitHub notifications (the built-in inbox)
description: GitHub notifications in the github.com inbox and GitHub Mobile, next to Hush: how each one sorts, pushes, and handles pull requests, and who should use which.
---

## Summary

**GitHub's own inbox is free, built in, and works on every GitHub plan, including Enterprise Server, with native mobile apps. Hush adds a layer on top for github.com: it decides whose turn it is on each thread, keeps a short "Needs you" list, and pushes only that.**

- Use GitHub's inbox if its time-sorted list and its filters are enough for you, if you use GitHub Enterprise Server, or if you want an app from GitHub itself.
- Use Hush if you get more notifications than you can read, and you want them sorted by who must act next.
- You can use both. Hush marks threads read and done on GitHub too, so the two stay in step.

## At a glance

|                          | GitHub notifications                                                                      | Hush                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Where it runs            | github.com, GitHub Mobile (iOS, Android), email                                           | Web app (installable), on Cloudflare                                  |
| Price                    | Included with GitHub                                                                      | Free in beta; planned $3 a month or $30 a year                        |
| Open source              | No                                                                                        | Yes                                                                   |
| Sort order               | Time (newest or oldest first)                                                             | Needs you, FYI, Muted, by whose turn it is                            |
| Filters                  | `reason:`, `is:`, `repo:`, `author:`, `org:`; up to 15 custom filters                     | Categories, a query language, up to 12 notification views             |
| Push                     | GitHub Mobile: mentions, assignments, review requests, deployment approvals, Actions runs | Web Push for "Needs you" items, with quiet hours, digests, and limits |
| Review a PR              | Yes, with the full diff (web and Mobile)                                                  | Approve, comment, merge, close, re-run CI; no diff view               |
| GitHub Enterprise Server | Yes                                                                                       | No (github.com only)                                                  |
| Several accounts         | Yes, in GitHub Mobile                                                                     | No (one GitHub account per Hush account)                              |
| How fast                 | At once                                                                                   | Checks GitHub every 5 minutes                                         |
| History kept             | Web notifications for 3 months; saved ones without a limit                                | Done threads until 30 days with no activity                           |

## How they sort

**GitHub** lists notifications by time. Since April 2026 you can sort newest first or oldest first, and group by repository. Filters use the reason GitHub gives (`reason:review-requested`, `reason:mention`, `reason:ci-activity`, and more), the type, the repository, the author, and the org. Default filters show assigned, participating, review requested, and @mentioned threads. You can save up to 15 custom filters. Filters cannot search the text of titles.

The reason that GitHub gives is fixed when the notification arrives. A thread with `reason:review-requested` keeps that reason after you review, and a thread with `reason:subscribed` does not say that CI failed on your pull request.

**Hush** reads the same notifications, but keeps only the ones about the pull requests and issues that your saved searches find. Releases, CI runs, discussions, and security alerts stay on GitHub. Hush reads the pull request or issue behind each notification: CI, reviews, review requests, conflicts, and the newest comment. From that it decides if you are the next person who must act. Those threads go to **Needs you**; the rest go to **FYI**. When you approve, push a fix, or reply, Hush moves the thread to Done by itself, and brings it back if it needs you again. See [what needs you](/docs/inbox#what-needs-you).

You can change the defaults with settings, for example whether bots are FYI, and with **Doesn't need me** on a thread. [Categories](/docs/categories) sort your pull requests and issues, for example by review effort.

## Pull requests and reviews

**GitHub** is the full tool. You read the diff, comment on lines, and submit reviews on github.com and in GitHub Mobile. Since July 2026, the pull requests dashboard at github.com/pulls has an inbox of review requests, pull requests that need a fix, and pull requests that are ready to merge, with saved views and `AND`/`OR` search. It covers pull requests, not issues or other notifications.

**Hush** has [Pull requests and Issues tabs](/docs/pull-requests-and-issues) grouped by whose turn it is: Your turn, Your team's turn, Waiting on others. The [peek](/docs/peek) shows the description, comments, reviews, and checks, and lets you approve, request changes, comment, merge, close, and re-run failed jobs. It does not show the diff, and it counts inline review comments without showing them. For a real code review, Hush sends you to GitHub.

## Push and alerts

**GitHub Mobile** pushes direct mentions, assignments, review requests, and deployment approvals, each with its own switch. It can also push GitHub Actions workflow runs that you started, with an option for failed runs only. On iOS you can set working hours for pushes. Email can go to a different address for each organization, and has headers that a mail filter can use. GitHub does not document browser push for the web inbox.

**Hush** sends Web Push to browsers and installed web apps on desktop and Android, and on iPhone or iPad only from a Home Screen web app (iOS 16.4 or later). By default it pushes only what arrives in Needs you, including events that come with no notification, such as new commits after your review. It has [quiet hours, digests, a limit, and one alert per pull request](/docs/notifications#how-often), and an alert history for 30 days. It also has private [Atom feeds](/docs/feeds) for each tab.

## Accounts, Enterprise, and privacy

**GitHub** works everywhere GitHub runs. GitHub Mobile can sign in to github.com, GHE.com, and GitHub Enterprise Server accounts at the same time. Your data stays with GitHub.

**Hush** works only with github.com, and one Hush account has one GitHub account. It is a third party: it stores your encrypted token, your threads, and the facts of each pull request and issue (see [Privacy](/privacy)). An org that limits OAuth apps hides its notifications from Hush until an owner approves it, or until you give Hush [a custom token](/docs/github-access#custom-token).

## Where GitHub is better

- It is built in and free, and nothing else gets access to your account.
- It works with GitHub Enterprise Server and GHE.com, and with several accounts in one app.
- Native iOS and Android apps, with push that needs no install step.
- The full diff and line comments, on the web and on a phone.
- It is complete at once; Hush waits up to 5 minutes for its next check.
- It shows every type of notification, also releases, CI runs, discussions, and security alerts.
- It is mature and maintained by GitHub. Hush is in beta.

## Where Hush is better

- It sorts by who must act next, not by time, and keeps that up to date as the pull request changes.
- It moves threads to Done by itself when they stop needing you, and brings them back when they need you again.
- Categories sort pull requests and issues by your rules, or by Jev, for example by review effort.
- Push for exactly the "Needs you" list, with quiet hours, digests, and limits, on any device with a modern browser.
- Snooze for a time, or until something happens (for example, until CI passes).
- One view of issues and pull requests that involve you, also when no notification came.

## Choose GitHub if…

- You use GitHub Enterprise Server, GHE.com, or more than one account.
- You want native mobile apps, or you do not want to give a third party access.
- Your inbox is small enough that a time-sorted list works.

## Choose Hush if…

- You work on github.com and get many notifications each day.
- You want one short list of what waits on you, and pushes for that list only.
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
- Hush: [docs](/docs), [limits](/docs/limits), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
