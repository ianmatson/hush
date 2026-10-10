---
title: Hush vs. gh-hush for GitHub notifications
description: gh-hush is a GitHub CLI extension that clears GitHub notifications by your rules; Hush (hush-gh.com) is a web app for your pull requests and issues, in views you define, with pushes for the facts you choose. Two different tools with similar names.
---

## Summary

**gh-hush and Hush are two different projects by different people. gh-hush is a free command-line tool (a GitHub CLI extension) that you run to unsubscribe from and mark done the unread notifications that match your rules. Hush, at hush-gh.com, is a web app for your GitHub pull requests and issues, in views that you define, with pushes for the facts that you choose. It never changes your notifications on GitHub.**

- Choose gh-hush if you use GitHub's notification inbox and want to clear its noise in one command, with a preview first.
- Choose Hush if you want your pull requests and issues as views, with pushes for the facts that you choose, and pull request actions.

## At a glance

|                      | gh-hush                                                  | Hush (hush-gh.com)                                                           |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| What it is           | A command that cleans your GitHub inbox                  | Views of pull requests and issues, with pushes                               |
| Where it runs        | Terminal, as a `gh` CLI extension                        | Web app (installable), on Cloudflare                                         |
| Price                | Free                                                     | Free in beta; planned $3 a month or $30 a year                               |
| Open source          | Yes (MIT)                                                | Yes (AGPL-3.0)                                                               |
| Where your data is   | On your computer; uses your `gh` sign-in                 | On Hush's servers; token encrypted                                           |
| Rules                | YAML; first match wins; `keep` or `hush`                 | Searches for views; custom sections and categories, first match wins         |
| What a rule does     | Unsubscribes from the thread and marks it done on GitHub | Puts an item in a view, a section, or a category in Hush; nothing on GitHub  |
| Works on             | Unread notifications, when you run it                    | Open pull requests and issues that your searches find, all the time          |
| Preview              | Yes; nothing changes until you confirm                   | **Try on GitHub** shows what a search finds                                  |
| Alerts               | None                                                     | Push for the facts that you choose; Web Push and Slack; quiet hours, digests |
| Pull request actions | None                                                     | Approve, comment, merge, close, re-run CI; diff and line comments            |
| First release        | August 2026; v0.5.0 on 13 September 2026                 | Beta                                                                         |

## How they work

**gh-hush** reads your unread notifications through the account that you signed in to with `gh`. It checks each one against the rules in your YAML file, in order. A rule matches on the repository, type, state, reason, author, assignee, review requests (to you or your teams), mentions, and age, and says `keep` or `hush`. gh-hush shows a preview with the rule that matched each notification. When you confirm, it unsubscribes from each hushed thread and marks it done on GitHub. Security alerts and types it does not support always stay. It works only on unread notifications, because of a limit in GitHub's API.

**Hush** checks GitHub every few minutes on its servers. It shows the open pull requests and issues that the searches of your [views](/docs/views) find. Each view puts its items into sections with [Group by](/docs/pull-requests-and-issues#group-by), or into [custom sections](/docs/pull-requests-and-issues#custom-sections) where the first matching rule wins. Each row says [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is), and [categories](/docs/categories) sort your pull requests and issues. Hush reads your notifications only to learn quickly that an item changed. Snooze, Mute, and Read stay in Hush, and nothing changes on GitHub (see [GitHub access](/docs/github-access#what-hush-does-on-github)).

## Where gh-hush is better

- One command clears a large notification inbox, with a full preview first.
- It runs on your computer, with no hosted service and no new access to your account.
- Its rules can match mentions of you or your teams and the age of a thread.
- Unsubscribing from noisy threads also makes GitHub send fewer notifications later, in every client.

## Where Hush is better

- It runs all the time, not only when you run a command.
- Views of your pull requests and issues, also for items that sent no notification.
- Each row says whose turn it is, from CI, reviews, and comments.
- Push alerts on desktop and phone for the facts that you choose.
- Snooze, categories, feeds, and pull request actions.

## Choose gh-hush if…

- You use GitHub's own notification inbox and want to clean it out from time to time.
- You want rules that you can read, run, and check in a terminal.

## Choose Hush if…

- You want your pull requests and issues as views, with pushes for the facts that you choose.
- You want to act on pull requests from the same list.

You can also use both: gh-hush keeps GitHub's inbox clean, and Hush never changes it.

## Sources

- [maxbeizer/gh-hush on GitHub](https://github.com/maxbeizer/gh-hush): README, MIT license, rules, API limit
- [gh-hush releases](https://github.com/maxbeizer/gh-hush/releases): v0.5.0, 13 September 2026
- Hush: [views](/docs/views), [categories](/docs/categories), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
