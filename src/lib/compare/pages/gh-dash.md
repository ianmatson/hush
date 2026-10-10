---
title: Hush vs. gh-dash for GitHub pull requests and notifications
description: gh-dash and Hush both put GitHub pull requests and issues into sections built from searches. gh-dash runs in the terminal and also lists GitHub notifications; Hush is a web app with pushes for the facts you choose.
---

## Summary

**gh-dash is the closest tool to Hush: both show your GitHub pull requests and issues in sections that you build from searches. gh-dash is a free, open-source terminal app (a GitHub CLI extension), with a notifications view since January 2026, and with diff, checkout, approve, and merge from the keyboard. Hush is a web app for your GitHub work, in views that you define, with pushes for the facts that you choose.**

- Choose gh-dash if you live in the terminal and want to check out and review code from the same place.
- Choose Hush if you want the same kind of sections in a browser and on your phone, plus push alerts, a peek to act in, Hush words in your searches, Group by, and categories.

## At a glance

|                          | gh-dash                                                                            | Hush                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Where it runs            | Terminal, as a `gh` CLI extension                                                  | Web app (installable), on Cloudflare                                                         |
| Price                    | Free                                                                               | Free in beta; planned $3 a month or $30 a year                                               |
| Open source              | Yes (MIT)                                                                          | Yes (AGPL-3.0)                                                                               |
| Where your data is       | On your computer; uses your `gh` sign-in                                           | On Hush's servers; token encrypted                                                           |
| Pull requests and issues | Sections from GitHub searches, in YAML                                             | Views of up to 5 searches each, with Hush words such as `size:<50` and `repo:acme/*`         |
| Sections                 | The sections that you define                                                       | Group by role, status, repository, author, label, assignee, category, project, or your rules |
| Whose turn it is         | Not decided; you build sections that come near to it                               | On each row, from CI, reviews, review requests, and comments                                 |
| Notifications            | Sections by GitHub reason and repository; mark read or done, unsubscribe, bookmark | Read only as a signal that an item changed; never listed or changed                          |
| Pull request actions     | Diff, checkout, comment, approve, merge, close, assign, watch checks               | Diff and line comments, approve, comment, merge, auto-merge, close, re-run CI; no checkout   |
| Alerts                   | Not documented                                                                     | Push for the facts that you choose; Web Push and Slack; quiet hours, digests                 |
| Runs when you are away   | No, it runs while open                                                             | Yes, it checks GitHub every 5 minutes                                                        |
| Latest release           | v4.26.0, 21 September 2026                                                         | Beta, updated continuously                                                                   |

## How they sort

**gh-dash** has three views: pull requests, issues, and notifications. Each view has sections that you define in a YAML file. Notification sections filter by GitHub's reason (`reason:review-requested`, `reason:mention`, `reason:participating`, and more), by repository, and by read state. It can limit a view to the repository of the folder you run it in. It does not decide whose turn it is; you build sections that come near to that.

**Hush** also starts from GitHub searches: each [view](/docs/views) has up to 5. A search can use Hush words that GitHub does not know, such as `size:<50`, `-author:bots`, `category:low`, or `repo:acme/*` (see [In a view's search](/docs/query-language#in-a-views-search)). Then [Group by](/docs/pull-requests-and-issues#group-by) puts the results into sections: your role, review status, repository, author, label, assignee, a category group, or the Status column of a GitHub project. [Custom sections](/docs/pull-requests-and-issues#custom-sections) give each section a name and a rule, and the first match wins. Each row also says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is).

Hush reads your GitHub notifications only to learn quickly that an item changed. It does not list them, and it never changes them on GitHub.

## Pull requests

**gh-dash** has more tools for code. From a pull request or a pull request notification you can view the diff, check out the branch, comment, approve, merge, close or reopen, assign, update from the base branch, mark ready for review, and watch the checks. Custom keys can run any command.

**Hush** shows the description, comments, reviews, and checks in the [peek](/docs/peek), with Approve, Request changes, Comment, Merge, Enable auto-merge, Close, and Re-run failed jobs. The full page has a [Files tab](/docs/peek#the-files-tab) with the diff, where you comment on lines and submit a review. Hush does not check out code.

## Alerts

**gh-dash** does not document desktop or push alerts. You see new items when you open or refresh it.

**Hush** keeps checking GitHub on its servers. It pushes the [facts that you choose](/docs/notifications#what-gets-pushed), such as a review request, a mention, or failed CI on your pull request. Each view can also push its new items. Pushes go to desktop and phone browsers, and to Slack, with [quiet hours, digests, and limits](/docs/notifications#how-often).

## Where gh-dash is better

- It runs in your terminal, next to your code and editor, with full keyboard control.
- Checkout and merge from the same place; custom keys run your own commands.
- It lists your GitHub notifications too, and can mark them read or done.
- Free and local; it uses the `gh` sign-in you already have and no hosted service.
- Mature and widely used: about 12,600 stars on GitHub and frequent releases.

## Where Hush is better

- Push alerts on desktop and phone for the facts that you choose, also when your computer is off.
- Hush words in searches, such as `size:` and `repo:acme/*`, that GitHub search does not have.
- Group by and custom sections split a view in many ways, with no YAML.
- Each row says whose turn it is, from CI, reviews, and comments.
- Categories that your rules or Jev fill in, and snooze, mute, and feeds.
- Works on any device with a browser, also a phone.

## Choose gh-dash if…

- You work in the terminal and want your GitHub work there too.
- You review code by checking it out, and want that one key away.
- You want your GitHub notifications in the same tool.
- You do not want a hosted service.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You want alerts when you are away from your desk.
- You use a phone or a browser more than a terminal.

## Sources

- [dlvhdr/gh-dash on GitHub](https://github.com/dlvhdr/gh-dash): README, MIT license
- [gh-dash releases](https://github.com/dlvhdr/gh-dash/releases): v4.26.0, 21 September 2026
- [gh-dash v4.22.0](https://github.com/dlvhdr/gh-dash/releases/tag/v4.22.0): the Notifications view, 20 January 2026
- [Installation](https://www.gh-dash.dev/getting-started), gh-dash docs
- [Notification sections](https://www.gh-dash.dev/configuration/notification-section), gh-dash docs
- [Selected notification keys](https://github.com/dlvhdr/gh-dash/blob/main/docs/src/content/docs/getting-started/keybindings/selected-notification.mdx), gh-dash docs source
- [Selected pull request keys](https://github.com/dlvhdr/gh-dash/blob/main/docs/src/content/docs/getting-started/keybindings/selected-pr.mdx), gh-dash docs source
- Hush: [views](/docs/views), [pull requests and issues](/docs/pull-requests-and-issues), [query language](/docs/query-language), [notifications](/docs/notifications), [pricing](/pricing)

_Last checked: 3 October 2026._
