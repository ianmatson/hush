---
title: Hush vs. gh-hush for GitHub notifications
description: gh-hush is a GitHub CLI extension that clears GitHub notifications by your rules; Hush (hush-gh.com) is a web app that sorts and pushes them. Two different tools with similar names.
---

## Summary

**gh-hush and Hush are two different projects by different people. gh-hush is a free command-line tool (a GitHub CLI extension) that you run to unsubscribe from and mark done the unread notifications that match your rules. Hush, at hush-gh.com, is a web app that keeps an inbox of your GitHub notifications, sorts them by whose turn it is, and sends push alerts.**

- Use gh-hush to clear noise from GitHub's own inbox in one command, with a preview first.
- Use Hush for a lasting inbox with a "Needs you" list, push alerts, and pull request actions.

## At a glance

|                      | gh-hush                                                  | Hush (hush-gh.com)                                                |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| What it is           | A command that cleans your GitHub inbox                  | A notification inbox with alerts                                  |
| Where it runs        | Terminal, as a `gh` CLI extension                        | Web app (installable), on Cloudflare                              |
| Price                | Free                                                     | Free in beta; planned $3 a month or $30 a year                    |
| Open source          | Yes (MIT)                                                | Yes                                                               |
| Where your data is   | On your computer; uses your `gh` sign-in                 | On Hush's servers; token encrypted                                |
| Rules                | YAML; first match wins; `keep` or `hush`                 | JSON; first match wins; Needs you, FYI, Muted, push, done, snooze |
| What a rule does     | Unsubscribes from the thread and marks it done on GitHub | Sorts the thread in Hush; Mute also unsubscribes on GitHub        |
| Works on             | Unread notifications, when you run it                    | Every notification, all the time                                  |
| Preview              | Yes; nothing changes until you confirm                   | Undo after each action                                            |
| Alerts               | None                                                     | Web Push, quiet hours, digests                                    |
| Pull request actions | None                                                     | Approve, comment, merge, close, re-run CI                         |
| First release        | August 2026; v0.5.0 on 13 September 2026                 | Beta                                                              |

## How they work

**gh-hush** reads your unread notifications through the account that you signed in to with `gh`. It checks each one against the rules in your YAML file, in order. A rule matches on the repository, type, state, reason, author, assignee, review requests (to you or your teams), mentions, and age, and says `keep` or `hush`. gh-hush shows a preview with the rule that matched each notification. When you confirm, it unsubscribes from each hushed thread and marks it done on GitHub. Security alerts and types it does not support always stay. It works only on unread notifications, because of a limit in GitHub's API.

**Hush** checks GitHub every few minutes on its servers. It reads the pull request or issue behind each notification and decides whose turn it is. Threads that wait on you go to **Needs you**, the rest to **FYI**, and your [rules](/docs/rules) can send threads to Muted, push them, or move them to Done or Snoozed. Done and Mute also act on GitHub (see [GitHub access](/docs/github-access#what-hush-does-on-github)).

## Where gh-hush is better

- One command clears a large inbox, with a full preview first.
- It runs on your computer, with no hosted service and no new access to your account.
- Its rules can match mentions of you or your teams and the age of a thread.
- Unsubscribing from noisy threads also makes GitHub send fewer notifications later, in every client.

## Where Hush is better

- It runs all the time and sorts each new notification as it comes, not only when you run a command.
- It decides who must act next from CI, reviews, and comments.
- Push alerts on desktop and phone.
- Snooze, saved views, feeds, and pull request actions.
- Read notifications are sorted too, not only unread ones.

## Choose gh-hush if…

- You use GitHub's own inbox and want to clean it out from time to time.
- You want rules that you can read, run, and check in a terminal.

## Choose Hush if…

- You want an inbox that stays sorted, and alerts for what needs you.
- You want to act on pull requests from the same list.

You can also use both: gh-hush to unsubscribe from noise, and Hush to sort what is left.

## Sources

- [maxbeizer/gh-hush on GitHub](https://github.com/maxbeizer/gh-hush): README, MIT license, rules, API limit
- [gh-hush releases](https://github.com/maxbeizer/gh-hush/releases): v0.5.0, 13 September 2026
- Hush: [inbox](/docs/inbox), [rules](/docs/rules), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
