---
title: Hush vs. Gitify for GitHub notifications
description: Gitify is a free desktop app that puts GitHub notifications in your menu bar. Hush is a web app for your GitHub pull requests and issues, in views you define, with pushes for the facts you choose. What each does well.
---

## Summary

**Gitify is a free, open-source desktop app that puts your GitHub notifications in the menu bar or system tray, with filters, several accounts, and GitHub Enterprise Server support. Hush is not a notification app: it is a web app that shows your pull requests and issues in views that you define, pushes the facts that you choose, and lets you approve, comment, and merge in place.**

- Choose Gitify if you want a notification tray app: native and local, on macOS, Windows, or Linux, with GitHub Enterprise Server, or with more than one account or forge.
- Choose Hush if you want your pull requests and issues as views, with pushes for the facts that you choose, also on your phone.

## At a glance

|                          | Gitify                                                                                        | Hush                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| What it is               | A notification tray app                                                                       | Views of pull requests and issues, with pushes                                   |
| Where it runs            | Desktop: macOS, Windows, Linux (menu bar or tray)                                             | Web app (installable), on Cloudflare                                             |
| Price                    | Free                                                                                          | Free in beta; planned $3 a month or $30 a year                                   |
| Open source              | Yes (MIT)                                                                                     | Yes (AGPL-3.0)                                                                   |
| Where your data is       | On your computer; token in the OS keychain                                                    | On Hush's servers; token encrypted                                               |
| Sort order               | GitHub's reasons, with filters; group by repository or date                                   | Sections by role, status, repository, category, project status, or your rules    |
| Filters                  | Reason, type, state, user type (bots), review request type, account, `author:`/`org:`/`repo:` | GitHub search and Hush words, such as `size:` and `repo:acme/*`; up to 12 views  |
| Alerts                   | Native desktop notifications, sound, unread count in the tray                                 | Push for the facts that you choose; Web Push and Slack; quiet hours, digests     |
| Actions                  | Mark read, mark done, unsubscribe, open on GitHub                                             | Snooze, mute, read; approve, comment, merge, close, re-run CI; diff on full page |
| Several accounts         | Yes                                                                                           | No                                                                               |
| GitHub Enterprise Server | Yes; also GHE.com                                                                             | No (github.com only)                                                             |
| Other forges             | Gitea, Forgejo, Codeberg, Bitbucket Cloud, GitLab                                             | No                                                                               |
| Phone                    | Not documented                                                                                | Yes, through Web Push                                                            |
| Latest release           | v7.8.0, 6 September 2026                                                                      | Beta, updated continuously                                                       |

## How they sort

**Gitify** shows your GitHub notifications in a small window from the menu bar or tray. You narrow the list with filters: the reason GitHub gives, the type, the state (open, closed, merged, draft), the user type (for example, to hide bots), the review request type (direct or team), the account, and include or exclude tokens such as `author:`, `org:`, and `repo:`. Filters combine with AND. You can group by repository or by date, and show only threads you participate in. Gitify does not decide whose turn it is; it shows what GitHub sends, filtered your way.

**Hush** does not list notifications. It shows the open pull requests and issues that the searches of your [views](/docs/views) find, also when no notification came. Each view puts its items into sections with [Group by](/docs/pull-requests-and-issues#group-by): your role, review status, repository, a category group, a project's Status column, or [custom sections](/docs/pull-requests-and-issues#custom-sections) with your own rules. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), from CI, reviews, review requests, conflicts, and comments.

Hush reads your notifications only to learn quickly that an item changed. It never marks them read or done on GitHub.

## Pull requests

**Gitify** has no review or comment features. You open the thread on GitHub to act. It can mark a thread done when you open it.

**Hush** has a [peek](/docs/peek) where you read the description, comments, reviews, and checks, then approve, request changes, comment, merge, close, or re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review.

## Alerts

**Gitify** sends native desktop notifications with an optional sound, and can show the unread count in the tray. It can start when you log in on macOS and Windows. A global shortcut opens it.

**Hush** pushes the [facts that you choose](/docs/notifications#what-gets-pushed), such as a review request, a mention, or failed CI on your pull request. Each view can also push its new items. Pushes go to desktop browsers, phones, and Slack, with [quiet hours, digests, and limits](/docs/notifications), and an alert history. Push on iPhone needs Hush on the Home Screen (iOS 16.4 or later).

## Accounts, Enterprise, and privacy

**Gitify** supports several accounts at once, on GitHub.com, GitHub Enterprise Server, and GitHub Enterprise Cloud with data residency, plus other forges. You sign in with GitHub, a classic personal access token, or your own OAuth app. It runs on your computer and stores the token with the operating system's secure storage.

**Hush** supports one github.com account. It runs on servers, so it can push to your phone when your computer is off, but it stores your encrypted token and the facts of your pull requests and issues (see [Privacy](/privacy)). An org that limits OAuth apps must approve Hush, or you can use [a custom token](/docs/github-access#custom-token). Both tools need a classic token or an OAuth token, because GitHub's Notifications API does not accept fine-grained tokens.

## Where Gitify is better

- A notification app: every GitHub notification, always one click away in the menu bar or tray.
- Free, with no account on a third-party server; your data stays on your computer.
- Several accounts at once, GitHub Enterprise Server, GHE.com, and other forges.
- Mature: the project started in 2015, has about 5,300 stars on GitHub, and still ships releases. Hush is in beta.

## Where Hush is better

- Views of your pull requests and issues from your searches, also with no notification.
- Sections by role, status, category, or your own rules, and whose turn it is on each row.
- Approve, comment, merge, and read the diff without a trip to GitHub.
- Push to your phone for the facts that you choose, with quiet hours and digests; it keeps checking when your computer sleeps.
- Categories, snoozes, and Atom feeds.

## Choose Gitify if…

- You want a light, local notification app, and the desktop is where you work.
- You use GitHub Enterprise Server, GHE.com, several accounts, or GitLab, Gitea, or Bitbucket too.
- You do not want a hosted service to hold a token for your account.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You want alerts on your phone as well as your desktop.
- You want to act on pull requests (approve, comment, merge) from the same list.

## Sources

- [gitify.io](https://gitify.io): platforms, price, features
- [Gitify FAQ](https://gitify.io/faq): accounts, auth methods, filters, keys
- [gitify-app/gitify on GitHub](https://github.com/gitify-app/gitify): README, MIT license, supported forges
- [Gitify releases](https://github.com/gitify-app/gitify/releases): v7.8.0, 6 September 2026
- [Gitify settings and filter types](https://github.com/gitify-app/gitify/blob/main/src/renderer/stores/types.ts), source code
- Hush: [views](/docs/views), [notifications](/docs/notifications), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
