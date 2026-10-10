---
title: Hush vs. Octobox for GitHub notifications
description: Octobox and Hush are both web apps for GitHub notifications. Octobox is a mature, self-hostable inbox with rich search; Hush sorts by whose turn it is and pushes what waits on you.
---

## Summary

**Octobox is a mature, open-source web inbox for GitHub notifications, with an archive state, rich search, Gmail-style keys, and a self-hosted option that works with GitHub Enterprise. Hush is a newer web app that decides whose turn it is on each thread, keeps a short "Needs you" list, and sends push alerts for it.**

- Choose Octobox to host your own copy, to use GitHub Enterprise, or for search over many fields.
- Choose Hush for a "Needs you" list, push alerts with quiet hours, and pull request actions in place.

## At a glance

|                      | Octobox                                                                                   | Hush                                                        |
| -------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Where it runs        | Web (octobox.io), or self-hosted (Docker, Heroku, OpenShift)                              | Web app (installable), on Cloudflare; self-hosting possible |
| Price                | Free for open source; enhanced data for private repos from $10 per user per month         | Free in beta; planned $3 a month or $30 a year              |
| Open source          | Yes (AGPL-3.0)                                                                            | Yes                                                         |
| Sort order           | Time, with search and filters                                                             | Needs you, FYI, Muted, by whose turn it is                  |
| Filters              | Repo, org, type, reason, state, CI status, labels, author, assignee, bot, draft, and more | Categories, a query language, views                         |
| Push alerts          | Not documented                                                                            | Web Push, quiet hours, digests, limits                      |
| Pull request actions | Comment from the thread view (beta)                                                       | Approve, request changes, comment, merge, close, re-run CI  |
| GitHub Enterprise    | Yes, when self-hosted                                                                     | No (github.com only)                                        |
| API                  | Yes (REST, OpenAPI)                                                                       | Atom feeds; settings as JSON                                |
| Latest release       | "october-2026", 1 October 2026                                                            | Beta, updated continuously                                  |

## How they sort

**Octobox** adds an **archive** state to GitHub notifications: you archive a thread when you finish, and Octobox brings it back to the inbox when new activity comes. You can also star and mute threads. Its search takes prefixes such as `repo:`, `owner:`, `type:`, `reason:`, `state:`, `label:`, `author:`, `status:` (CI), `bot:`, `draft:`, and `assignee:`, and combines them with free text. With its optional GitHub App, Octobox also gets the state, CI status, labels, and author of each item. The list is sorted by time; Octobox does not decide which threads need you.

**Hush** reads the pull request or issue behind each notification and decides if you are the next person who must act. Those threads go to **Needs you**; the rest go to **FYI**. When a thread stops needing you (you approved, CI passes now, it was merged), Hush moves it to Done with a note; if it needs you again, it comes back. **Doesn't need me** and a few settings change where threads go, and [categories](/docs/categories) sort your pull requests and issues.

Both apps bring a finished thread back when there is new activity, and in both, Mute stops the notifications of that thread.

## Pull requests

**Octobox** has a thread view, in public beta, that shows the comments of a notification inside Octobox. You can post a comment from it. Approve and merge are not documented.

**Hush** has [views](/docs/views) of pull requests and issues, grouped by Your turn, Your team's turn, and Waiting on others, also for items with no notification. The [peek](/docs/peek) shows the description, comments, reviews, and checks, with Approve, Request changes, Comment, Merge, Close, and Re-run failed jobs. Hush does not show the diff.

## Alerts

**Octobox** does not document push or desktop alerts. Its "live updates" setting refreshes the rows on screen. For a desktop app, the README suggests wrapping the site with Nativefier, or a community browser extension.

**Hush** sends Web Push to desktop and phone browsers, by default only for "Needs you". It has [quiet hours, digests, a limit, and one alert per pull request](/docs/notifications#how-often), and private [Atom feeds](/docs/feeds).

## Hosting and privacy

**Octobox** runs as a hosted service at octobox.io, or on your own server. A self-hosted copy can point at GitHub Enterprise, can let in only one org or team, and can turn on personal access tokens. The hosted service stores your email address, page-visit data, basic data about notifications, and, with the GitHub App, authors, labels, comments, and status. Tokens are encrypted.

**Hush** is hosted on Cloudflare, with each user's data in storage of its own. It stores your encrypted token, your threads, and the facts of each pull request and issue; it has no analytics (see [Privacy](/privacy)). The code is open, so you can run your own copy, but Hush calls only api.github.com, so a copy does not work with GitHub Enterprise Server.

## Where Octobox is better

- Self-hosting is documented, with Docker, Heroku, and OpenShift, and works with GitHub Enterprise.
- Free for open-source work, with no account limit stated.
- Search over many fields, including labels, assignees, CI status, and draft state.
- A REST API for your notifications and pinned searches.
- Mature: in development since 2016, with monthly releases and about 4,500 stars on GitHub.

## Where Hush is better

- It decides who must act next, and keeps one short "Needs you" list up to date.
- Push alerts on desktop and phone, with quiet hours and digests.
- Approve, request changes, merge, and re-run CI from the list.
- Dashboards of pull requests and issues that involve you, also with no notification.
- Categories that sort pull requests and issues by your rules, or by Jev.

## Choose Octobox if…

- You must host the tool yourself, or you use GitHub Enterprise Server.
- You maintain open-source projects and want a free inbox with strong search.
- You want an API to build on.

## Choose Hush if…

- You want the app to tell you which threads wait on you, not only to filter them.
- You want push alerts on your phone.
- You review and merge many pull requests and want to do it from the inbox.

## Sources

- [octobox.io](https://octobox.io): service, pricing
- [Octobox documentation](https://octobox.io/documentation): search prefixes, keys, mute
- [Octobox privacy policy](https://octobox.io/privacy)
- [octobox/octobox on GitHub](https://github.com/octobox/octobox): README, AGPL-3.0 license, thread view, desktop use
- [Octobox installation guide](https://github.com/octobox/octobox/blob/main/docs/INSTALLATION.md): self-hosting, GitHub App, GitHub Enterprise, live updates
- [Octobox releases](https://github.com/octobox/octobox/releases): "october-2026", 1 October 2026
- Hush: [inbox](/docs/inbox), [peek](/docs/peek), [notifications](/docs/notifications), [privacy](/privacy), [pricing](/pricing)

_Last checked: 3 October 2026._
