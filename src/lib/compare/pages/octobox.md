---
title: Hush vs. Octobox for GitHub notifications
description: Octobox is a mature, self-hostable web inbox for GitHub notifications, with rich search. Hush is a web app for your GitHub pull requests and issues, in views you define, with pushes for the facts you choose.
---

## Summary

**Octobox is a mature, open-source web inbox for GitHub notifications, with an archive state, rich search, Gmail-style keys, and a self-hosted option that works with GitHub Enterprise. Hush is a newer web app that is not a notification inbox: it shows your pull requests and issues in views that you define, and pushes the facts that you choose.**

- Choose Octobox if you want a notification inbox that you can host yourself, that works with GitHub Enterprise, or that searches over many fields.
- Choose Hush if you want your pull requests and issues as views, with pushes for the facts that you choose, and pull request actions in place.

## At a glance

|                      | Octobox                                                                                   | Hush                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| What it is           | A notification inbox                                                                      | Views of pull requests and issues, with pushes                                     |
| Where it runs        | Web (octobox.io), or self-hosted (Docker, Heroku, OpenShift)                              | Web app (installable), on Cloudflare; self-hosting possible                        |
| Price                | Free for open source; enhanced data for private repos from $10 per user per month         | Free in beta; planned $3 a month or $30 a year                                     |
| Open source          | Yes (AGPL-3.0)                                                                            | Yes (AGPL-3.0)                                                                     |
| Sort order           | Time, with search and filters                                                             | Sections by role, status, repository, category, project status, or your rules      |
| Filters              | Repo, org, type, reason, state, CI status, labels, author, assignee, bot, draft, and more | GitHub search and Hush words, such as `size:` and `repo:acme/*`; up to 12 views    |
| Push alerts          | Not documented                                                                            | The facts that you choose; Web Push and Slack; quiet hours, digests, limits        |
| Pull request actions | Comment from the thread view (beta)                                                       | Approve, request changes, comment, merge, close, re-run CI; diff and line comments |
| GitHub Enterprise    | Yes, when self-hosted                                                                     | No (github.com only)                                                               |
| API                  | Yes (REST, OpenAPI)                                                                       | Atom feeds; settings as JSON                                                       |
| Latest release       | "october-2026", 1 October 2026                                                            | Beta, updated continuously                                                         |

## How they sort

**Octobox** adds an **archive** state to GitHub notifications: you archive a thread when you finish, and Octobox brings it back to the inbox when new activity comes. You can also star and mute threads. Its search takes prefixes such as `repo:`, `owner:`, `type:`, `reason:`, `state:`, `label:`, `author:`, `status:` (CI), `bot:`, `draft:`, and `assignee:`, and combines them with free text. With its optional GitHub App, Octobox also gets the state, CI status, labels, and author of each item. The list is sorted by time; Octobox does not decide whose turn it is.

**Hush** does not keep a notification inbox. It shows the open pull requests and issues that the searches of your [views](/docs/views) find, also when no notification came. Each view puts its items into sections with [Group by](/docs/pull-requests-and-issues#group-by), or into [custom sections](/docs/pull-requests-and-issues#custom-sections) with a rule each. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), and [categories](/docs/categories) sort your pull requests and issues.

Hush reads your notifications only to learn quickly that an item changed. It never changes them on GitHub. Snooze, Mute, and Unread stay in Hush.

## Pull requests

**Octobox** has a thread view, in public beta, that shows the comments of a notification inside Octobox. You can post a comment from it. Approve and merge are not documented.

**Hush** has a [peek](/docs/peek) that shows the description, comments, reviews, and checks, with Approve, Request changes, Comment, Merge, Close, and Re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review.

## Alerts

**Octobox** does not document push or desktop alerts. Its "live updates" setting refreshes the rows on screen. For a desktop app, the README suggests wrapping the site with Nativefier, or a community browser extension.

**Hush** pushes the [facts that you choose](/docs/notifications#what-gets-pushed), such as a review request, a mention, or failed CI on your pull request. Each view can also push its new items. Pushes go to desktop and phone browsers, and to Slack. Hush has [quiet hours, digests, a limit, and one alert per pull request](/docs/notifications#how-often), and private [Atom feeds](/docs/feeds).

## Hosting and privacy

**Octobox** runs as a hosted service at octobox.io, or on your own server. A self-hosted copy can point at GitHub Enterprise, can let in only one org or team, and can turn on personal access tokens. The hosted service stores your email address, page-visit data, basic data about notifications, and, with the GitHub App, authors, labels, comments, and status. Tokens are encrypted.

**Hush** is hosted on Cloudflare, with each user's data in storage of its own. It stores your encrypted token and the facts of each pull request and issue; it has no analytics (see [Privacy](/privacy)). The code is open, so you can run your own copy, but Hush calls only api.github.com, so a copy does not work with GitHub Enterprise Server.

## Where Octobox is better

- A real notification inbox, with every notification and an archive state.
- Self-hosting is documented, with Docker, Heroku, and OpenShift, and works with GitHub Enterprise.
- Free for open-source work, with no account limit stated.
- Search over many fields, including labels, assignees, CI status, and draft state.
- A REST API for your notifications and pinned searches.
- Mature: in development since 2016, with monthly releases and about 4,500 stars on GitHub.

## Where Hush is better

- Views of pull requests and issues from your searches, also with no notification.
- Sections by role, review status, category, project status, or your own rules, and whose turn it is on each row.
- Push alerts for the facts that you choose, on desktop and phone, with quiet hours and digests.
- Approve, request changes, merge, re-run CI, and review the diff from the list.
- Categories that sort pull requests and issues by your rules, or by Jev.

## Choose Octobox if…

- You want a notification inbox, and you must host it yourself or use GitHub Enterprise Server.
- You maintain open-source projects and want a free inbox with strong search.
- You want an API to build on.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You want push alerts on your phone.
- You review and merge many pull requests and want to do it from the list.

## Sources

- [octobox.io](https://octobox.io): service, pricing
- [Octobox documentation](https://octobox.io/documentation): search prefixes, keys, mute
- [Octobox privacy policy](https://octobox.io/privacy)
- [octobox/octobox on GitHub](https://github.com/octobox/octobox): README, AGPL-3.0 license, thread view, desktop use
- [Octobox installation guide](https://github.com/octobox/octobox/blob/main/docs/INSTALLATION.md): self-hosting, GitHub App, GitHub Enterprise, live updates
- [Octobox releases](https://github.com/octobox/octobox/releases): "october-2026", 1 October 2026
- Hush: [views](/docs/views), [peek](/docs/peek), [notifications](/docs/notifications), [privacy](/privacy), [pricing](/pricing)

_Last checked: 3 October 2026._
