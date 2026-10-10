---
title: Hush vs. Neat for GitHub notifications
description: Neat puts GitHub notifications in the macOS menu bar, for free, with local data; Hush is a web app that sorts GitHub notifications by whose turn it is and pushes to any device.
---

## Summary

**Neat is a free macOS menu bar app for GitHub and Linear notifications, with keyboard navigation, filters for projects, users, and events, and all data stored on your Mac. Hush is a web app that decides whose turn it is on each GitHub thread, keeps a "Needs you" list, and pushes it to desktop and phone browsers.**

- Choose Neat if you work on a Mac and want notifications in the menu bar, with nothing stored on a server.
- Choose Hush if you use other systems or a phone, or want pull request dashboards, categories, and actions in one place.

## At a glance

|                                     | Neat                                                            | Hush                                                                |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Where it runs                       | macOS menu bar app                                              | Web app (installable), on Cloudflare                                |
| Price                               | Free                                                            | Free in beta; planned $3 a month or $30 a year                      |
| Open source                         | No                                                              | Yes                                                                 |
| Where your data is                  | On your Mac ("100% locally stored")                             | On Hush's servers; token encrypted                                  |
| Sources                             | GitHub and Linear                                               | GitHub                                                              |
| Sorting                             | Filters for projects, users, and events; pin to set priority    | Needs you, FYI, Muted, by whose turn it is; categories              |
| Actions                             | Preview without marking read, mark done, pin, mute, mark unread | Done, snooze, mute, read; approve, comment, merge, close, re-run CI |
| Alerts                              | Desktop and menu bar                                            | Web Push on desktop and phone, quiet hours, digests                 |
| Windows, Linux, phone               | Not documented                                                  | Yes, in a browser                                                   |
| GitHub Enterprise, several accounts | Not documented                                                  | No                                                                  |
| Latest release                      | v0.0.64, 20 August 2026                                         | Beta, updated continuously                                          |

## How they sort

**Neat** shows your GitHub notifications in a menu bar window. It says it pings you "only when an issue needs your attention", and lets you choose which projects, users, and events get through, for example to stop a noisy bot. You can pin a notification to set its priority. Neat does not document how it decides what needs your attention.

**Hush** reads each pull request and issue in your views (CI, reviews, review requests, conflicts, comments) and decides if you are the next person who must act. [Whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is) lists the cases. When you act, the item stops being your turn by itself.

## Pull requests

**Neat** says it helps you "merge pull requests faster" and "nudge reviewers for stale PRs". It shows a rich preview of a comment, and you open GitHub for the review.

**Hush** has [views](/docs/views) of pull requests and issues, grouped by whose turn it is, and a [peek](/docs/peek) with Approve, Request changes, Comment, Merge, Close, and Re-run failed jobs. It does not show the diff.

## Privacy

**Neat** stores everything on your computer. Its privacy policy (January 2022) says it collects your email, usage data, IP address, and device data.

**Hush** stores your encrypted token and your thread data on its servers, so that it can check GitHub and push while your computer is off. It has no analytics (see [Privacy](/privacy)).

## Maintenance

Neat released seven versions from 18 to 20 August 2026 (v0.0.58 to v0.0.64). The release before them was v0.0.57, in January 2023. Its changelog site did not load when we checked.

## Where Neat is better

- A native macOS app in the menu bar, one keystroke away.
- Your notification data stays on your Mac.
- GitHub and Linear in one place.
- Free, with no paid plan.

## Where Hush is better

- It runs on any system with a browser: Windows, Linux, Android, iPhone, and Mac.
- It decides who must act next, and moves threads to Done by itself.
- Pull request and issue dashboards, and approve or merge from the list.
- Push alerts on your phone, with quiet hours and digests.
- Open source, with documented sorting rules.

## Choose Neat if…

- You work on a Mac and want GitHub notifications in the menu bar.
- You want no notification data on a server.
- You use Linear as well as GitHub.

## Choose Hush if…

- You use Windows, Linux, or a phone, or more than one computer.
- You want to know exactly why a thread needs you, and change that.
- You want to act on pull requests from the same list.

## Sources

- [neat.run](https://neat.run): platforms, local storage
- [Neat for GitHub](https://neat.run/github): features
- [Neat on GitHub Marketplace](https://github.com/marketplace/notifications-by-neat): price, "macOS only"
- [Neat privacy policy](https://neat.run/privacy)
- [Neat releases](https://github.com/neat-run/activity-feed-public/releases): v0.0.64, 20 August 2026
- Hush: [views](/docs/views), [categories](/docs/categories), [notifications](/docs/notifications), [privacy](/privacy), [pricing](/pricing)

_Last checked: 3 October 2026._
