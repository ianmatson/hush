---
title: Hush vs. Gitify for GitHub notifications
description: Gitify and Hush both help with GitHub notifications. Gitify is a free desktop app in your menu bar; Hush is a web app that sorts by whose turn it is. What each does well.
---

## Summary

**Gitify is a free, open-source desktop app that puts your GitHub notifications in the menu bar or system tray, with filters, several accounts, and GitHub Enterprise Server support. Hush is a web app that reads the pull request or issue behind each notification, sorts it by who must act next, and lets you approve, comment, and merge in place.**

- Choose Gitify for a native, local app on macOS, Windows, or Linux, for GitHub Enterprise Server, or for more than one account or forge.
- Choose Hush for a short "Needs you" list, push on your phone, and pull request actions without a trip to GitHub.

## At a glance

|                          | Gitify                                                                                        | Hush                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Where it runs            | Desktop: macOS, Windows, Linux (menu bar or tray)                                             | Web app (installable), on Cloudflare                                |
| Price                    | Free                                                                                          | Free in beta; planned $3 a month or $30 a year                      |
| Open source              | Yes (MIT)                                                                                     | Yes                                                                 |
| Where your data is       | On your computer; token in the OS keychain                                                    | On Hush's servers; token encrypted                                  |
| Sort order               | GitHub's reasons, with filters; group by repository or date                                   | Needs you, FYI, Muted, by whose turn it is                          |
| Filters                  | Reason, type, state, user type (bots), review request type, account, `author:`/`org:`/`repo:` | Rules, a query language, saved views                                |
| Alerts                   | Native desktop notifications, sound, unread count in the tray                                 | Web Push on desktop and phone, quiet hours, digests                 |
| Actions                  | Mark read, mark done, unsubscribe, open on GitHub                                             | Done, snooze, mute, read; approve, comment, merge, close, re-run CI |
| Several accounts         | Yes                                                                                           | No                                                                  |
| GitHub Enterprise Server | Yes; also GHE.com                                                                             | No (github.com only)                                                |
| Other forges             | Gitea, Forgejo, Codeberg, Bitbucket Cloud, GitLab                                             | No                                                                  |
| Phone                    | Not documented                                                                                | Yes, through Web Push                                               |
| Latest release           | v7.8.0, 6 September 2026                                                                      | Beta, updated continuously                                          |

## How they sort

**Gitify** shows your GitHub notifications in a small window from the menu bar or tray. You narrow the list with filters: the reason GitHub gives, the type, the state (open, closed, merged, draft), the user type (for example, to hide bots), the review request type (direct or team), the account, and include or exclude tokens such as `author:`, `org:`, and `repo:`. Filters combine with AND. You can group by repository or by date, and show only threads you participate in. Gitify does not decide which threads need you; it shows what GitHub sends, filtered your way.

**Hush** reads the pull request or issue behind each notification (CI, reviews, review requests, conflicts, new comments) and decides if you are the next person who must act. Those threads go to **Needs you**; the rest go to **FYI**. When you approve or push a fix, Hush moves the thread to Done by itself. [Categories and tags](/docs/pull-requests-and-issues#categories-and-tags) sort items by repository, author, label, or what they are about.

## Pull requests

**Gitify** has no review or comment features. You open the thread on GitHub to act. It can mark a thread done when you open it.

**Hush** has [Pull requests and Issues tabs](/docs/pull-requests-and-issues) grouped by whose turn it is, and a [peek](/docs/peek) where you read the description, comments, reviews, and checks, then approve, request changes, comment, merge, close, or re-run failed jobs. Hush does not show the diff.

## Alerts

**Gitify** sends native desktop notifications with an optional sound, and can show the unread count in the tray. It can start when you log in on macOS and Windows. A global shortcut opens it.

**Hush** sends Web Push to desktop browsers and phones, by default only for "Needs you". It has [quiet hours, digests, and limits](/docs/notifications), and an alert history. Push on iPhone needs Hush on the Home Screen (iOS 16.4 or later).

## Accounts, Enterprise, and privacy

**Gitify** supports several accounts at once, on GitHub.com, GitHub Enterprise Server, and GitHub Enterprise Cloud with data residency, plus other forges. You sign in with GitHub, a classic personal access token, or your own OAuth app. It runs on your computer and stores the token with the operating system's secure storage.

**Hush** supports one github.com account. It runs on servers, so it can push to your phone when your computer is off, but it stores your encrypted token and your thread data (see [Privacy](/privacy)). An org that limits OAuth apps must approve Hush, or you can use [a custom token](/docs/github-access#custom-token). Both tools need a classic token or an OAuth token, because GitHub's Notifications API does not accept fine-grained tokens.

## Where Gitify is better

- A native desktop app, always one click away in the menu bar or tray.
- Free, with no account on a third-party server; your data stays on your computer.
- Several accounts at once, GitHub Enterprise Server, GHE.com, and other forges.
- Mature: the project started in 2015, has about 5,300 stars on GitHub, and still ships releases. Hush is in beta.

## Where Hush is better

- It sorts by who must act next, from the state of the pull request, not only GitHub's reason.
- It moves threads to Done by itself when they stop needing you.
- Approve, comment, and merge without leaving the list.
- Push to your phone, with quiet hours and digests; it keeps checking when your computer sleeps.
- Rules, snoozes, saved views, and Atom feeds.

## Choose Gitify if…

- You want a light, local desktop app and the desktop is where you work.
- You use GitHub Enterprise Server, GHE.com, several accounts, or GitLab, Gitea, or Bitbucket too.
- You do not want a hosted service to hold a token for your account.

## Choose Hush if…

- Your notifications are too many to read, and you want only the ones that wait on you.
- You want alerts on your phone as well as your desktop.
- You want to act on pull requests (approve, comment, merge) from the same list.

## Sources

- [gitify.io](https://gitify.io): platforms, price, features
- [Gitify FAQ](https://gitify.io/faq): accounts, auth methods, filters, keys
- [gitify-app/gitify on GitHub](https://github.com/gitify-app/gitify): README, MIT license, supported forges
- [Gitify releases](https://github.com/gitify-app/gitify/releases): v7.8.0, 6 September 2026
- [Gitify settings and filter types](https://github.com/gitify-app/gitify/blob/main/src/renderer/stores/types.ts), source code
- Hush: [whose turn](/docs/turns), [notifications](/docs/notifications), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
