---
title: Hush vs. Neat for GitHub notifications
description: Neat puts GitHub notifications in the macOS menu bar, for free, with local data. Hush is a web app for your GitHub pull requests and issues, in views you define, with pushes for the facts you choose, on any device.
---

## Summary

**Neat is a free macOS menu bar app for GitHub and Linear notifications, with keyboard navigation, filters for projects, users, and events, and all data stored on your Mac. Hush is not a notification app: it is a web app that shows your GitHub pull requests and issues in views that you define, and pushes the facts that you choose to desktop and phone browsers.**

- Choose Neat if you want a notification app in the Mac menu bar, with nothing stored on a server.
- Choose Hush if you want your pull requests and issues as views, with pushes for the facts that you choose, on any system or a phone.

## At a glance

|                                     | Neat                                                            | Hush                                                                             |
| ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| What it is                          | A notification menu bar app                                     | Views of pull requests and issues, with pushes                                   |
| Where it runs                       | macOS menu bar app                                              | Web app (installable), on Cloudflare                                             |
| Price                               | Free                                                            | Free in beta; planned $3 a month or $30 a year                                   |
| Open source                         | No                                                              | Yes (AGPL-3.0)                                                                   |
| Where your data is                  | On your Mac ("100% locally stored")                             | On Hush's servers; token encrypted                                               |
| Sources                             | GitHub and Linear                                               | GitHub                                                                           |
| Sorting                             | Filters for projects, users, and events; pin to set priority    | Sections by role, status, repository, category, project status, or your rules    |
| Actions                             | Preview without marking read, mark done, pin, mute, mark unread | Snooze, mute, read; approve, comment, merge, close, re-run CI; diff on full page |
| Alerts                              | Desktop and menu bar                                            | Push for the facts that you choose; Web Push and Slack; quiet hours, digests     |
| Windows, Linux, phone               | Not documented                                                  | Yes, in a browser                                                                |
| GitHub Enterprise, several accounts | Not documented                                                  | No                                                                               |
| Latest release                      | v0.0.64, 20 August 2026                                         | Beta, updated continuously                                                       |

## How they sort

**Neat** shows your GitHub notifications in a menu bar window. It says it pings you "only when an issue needs your attention", and lets you choose which projects, users, and events get through, for example to stop a noisy bot. You can pin a notification to set its priority. Neat does not document how it decides what needs your attention.

**Hush** does not list notifications. It shows the open pull requests and issues that the searches of your [views](/docs/views) find, in sections by [Group by](/docs/pull-requests-and-issues#group-by) or by [custom sections](/docs/pull-requests-and-issues#custom-sections) with your own rules. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), from CI, reviews, review requests, conflicts, and comments. The docs list every case. Hush reads your notifications only to learn quickly that an item changed, and never changes them.

## Pull requests

**Neat** says it helps you "merge pull requests faster" and "nudge reviewers for stale PRs". It shows a rich preview of a comment, and you open GitHub for the review.

**Hush** has a [peek](/docs/peek) with Approve, Request changes, Comment, Merge, Close, and Re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review.

## Privacy

**Neat** stores everything on your computer. Its privacy policy (January 2022) says it collects your email, usage data, IP address, and device data.

**Hush** stores your encrypted token and the facts of your pull requests and issues on its servers, so that it can check GitHub and push while your computer is off. It has no analytics (see [Privacy](/privacy)).

## Maintenance

Neat released seven versions from 18 to 20 August 2026 (v0.0.58 to v0.0.64). The release before them was v0.0.57, in January 2023. Its changelog site did not load when we checked.

## Where Neat is better

- A native macOS notification app in the menu bar, one keystroke away.
- Your notification data stays on your Mac.
- GitHub and Linear in one place.
- Free, with no paid plan.

## Where Hush is better

- It runs on any system with a browser: Windows, Linux, Android, iPhone, and Mac.
- Views of your pull requests and issues from your searches, in sections that you choose.
- Push alerts on your phone for the facts that you choose, with quiet hours and digests.
- Approve, merge, and read the diff from the list.
- Open source, with documented rules for whose turn it is.

## Choose Neat if…

- You work on a Mac and want a notification app in the menu bar.
- You want no notification data on a server.
- You use Linear as well as GitHub.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You use Windows, Linux, or a phone, or more than one computer.
- You want to act on pull requests from the same list.

## Sources

- [neat.run](https://neat.run): platforms, local storage
- [Neat for GitHub](https://neat.run/github): features
- [Neat on GitHub Marketplace](https://github.com/marketplace/notifications-by-neat): price, "macOS only"
- [Neat privacy policy](https://neat.run/privacy)
- [Neat releases](https://github.com/neat-run/activity-feed-public/releases): v0.0.64, 20 August 2026
- Hush: [views](/docs/views), [categories](/docs/categories), [notifications](/docs/notifications), [privacy](/privacy), [pricing](/pricing)

_Last checked: 3 October 2026._
