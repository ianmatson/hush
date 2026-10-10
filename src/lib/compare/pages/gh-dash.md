---
title: Hush vs. gh-dash for GitHub notifications
description: gh-dash is a terminal dashboard for GitHub pull requests, issues, and notifications; Hush is a web app for GitHub notifications with push alerts. What each one does well.
---

## Summary

**gh-dash is a free, open-source terminal app (a GitHub CLI extension) with configurable sections of pull requests, issues, and, since January 2026, notifications, and with diff, checkout, approve, and merge from the keyboard. Hush is a web app that decides whose turn it is on each thread, keeps a "Needs you" list, and pushes it to your devices.**

- Choose gh-dash if you live in the terminal and want to check out and review code from the same place.
- Choose Hush if you want sorting by who must act next, and alerts on your phone when you are away from the terminal.

## At a glance

|                          | gh-dash                                                                            | Hush                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Where it runs            | Terminal, as a `gh` CLI extension                                                  | Web app (installable), on Cloudflare                                       |
| Price                    | Free                                                                               | Free in beta; planned $3 a month or $30 a year                             |
| Open source              | Yes (MIT)                                                                          | Yes                                                                        |
| Where your data is       | On your computer; uses your `gh` sign-in                                           | On Hush's servers; token encrypted                                         |
| Notifications            | Sections by GitHub reason and repository; mark read or done, unsubscribe, bookmark | Needs you, FYI, Muted, by whose turn it is; done, snooze, mute, categories |
| Pull requests and issues | Sections from GitHub searches, in YAML                                             | Views from GitHub searches, grouped by whose turn it is, with categories   |
| Pull request actions     | Diff, checkout, comment, approve, merge, close, assign, watch checks               | Approve, comment, merge, close, re-run CI; no diff                         |
| Alerts                   | Not documented                                                                     | Web Push, quiet hours, digests                                             |
| Runs when you are away   | No, it runs while open                                                             | Yes, it checks GitHub every 5 minutes                                      |
| Latest release           | v4.26.0, 21 September 2026                                                         | Beta, updated continuously                                                 |

## How they sort

**gh-dash** has three views: pull requests, issues, and notifications. Each view has sections that you define in a YAML file. Notification sections filter by GitHub's reason (`reason:review-requested`, `reason:mention`, `reason:participating`, and more), by repository, and by read state. It can limit a view to the repository of the folder you run it in. It does not decide which threads need you; you build sections that come near to that.

**Hush** reads the pull request or issue behind each notification and decides if you are the next person who must act: your review is requested, CI fails on your PR, someone replied to you. Those threads go to **Needs you**, and Hush moves them to Done by itself when they stop needing you. Its [views](/docs/views) also use saved GitHub searches, but group the results into Your turn, Your team's turn, and Waiting on others, and give each item its categories.

## Pull requests

**gh-dash** has more review tools. From a pull request or a pull request notification you can view the diff, check out the branch, comment, approve, merge, close or reopen, assign, update from the base branch, mark ready for review, and watch the checks. Custom keys can run any command.

**Hush** shows the description, comments, reviews, and checks in the [peek](/docs/peek), with Approve, Request changes, Comment, Merge, Close, and Re-run failed jobs. It does not show the diff or check out code.

## Alerts

**gh-dash** does not document desktop or push alerts. You see new items when you open or refresh it.

**Hush** keeps checking GitHub on its servers, and sends Web Push to desktop and phone browsers for what needs you, with [quiet hours, digests, and limits](/docs/notifications).

## Where gh-dash is better

- It runs in your terminal, next to your code and editor, with full keyboard control.
- Diff, checkout, and merge from the same place; custom keys run your own commands.
- Free and local; it uses the `gh` sign-in you already have and no hosted service.
- Mature and widely used: about 12,600 stars on GitHub and frequent releases.

## Where Hush is better

- It decides who must act next, from CI, reviews, and comments, not only from GitHub's reason.
- Push alerts on desktop and phone, also when your computer is off.
- Snooze, mute, views, and categories that Jev fills in for you.
- Works on any device with a browser, also a phone.

## Choose gh-dash if…

- You work in the terminal and want your GitHub work there too.
- You review code by checking it out, and want that one key away.
- You do not want a hosted service.

## Choose Hush if…

- You want a list of what waits on you, not a set of filters to read through.
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
- Hush: [inbox](/docs/inbox), [pull requests and issues](/docs/pull-requests-and-issues), [notifications](/docs/notifications), [pricing](/pricing)

_Last checked: 3 October 2026._
