---
title: Hush vs. Notifier for GitHub: two ways to watch GitHub notifications
description: Notifier for GitHub is a small browser extension that counts unread GitHub notifications; Hush is a web app that sorts them by whose turn it is. When a badge is enough, and when it is not.
---

## Summary

**Notifier for GitHub is a free, open-source browser extension that shows your unread GitHub notification count on the toolbar and can send desktop alerts; it works with GitHub Enterprise Server and needs no server. Hush is a full inbox: it sorts notifications by who must act next, lets you triage and act on them, and pushes only what needs you.**

- Choose Notifier for GitHub if you only want to know when something new arrives, and you triage on github.com.
- Choose Hush if the count is always high and you want help to decide what to read first.

## At a glance

|                          | Notifier for GitHub                                                 | Hush                                                |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------- |
| What it is               | Toolbar badge and alerts                                            | Notification inbox with triage                      |
| Where it runs            | Chrome (also Edge, Opera, Brave) and Firefox                        | Web app (installable), on Cloudflare                |
| Price                    | Free                                                                | Free in beta; planned $3 a month or $30 a year      |
| Open source              | Yes (MIT)                                                           | Yes                                                 |
| Where your data is       | In your browser; no server                                          | On Hush's servers; token encrypted                  |
| Sorting                  | None; can count only threads you participate in                     | Needs you, FYI, Muted, by whose turn it is          |
| Triage                   | None; a click opens GitHub                                          | Done, snooze, mute, read, categories                |
| Alerts                   | Optional desktop alerts with sound; can limit them to chosen owners | Web Push on desktop and phone, quiet hours, digests |
| How often                | About once a minute, as GitHub allows                               | Every 5 minutes                                     |
| GitHub Enterprise Server | Yes (custom root URL)                                               | No                                                  |
| Latest release           | 25.6.25, 25 June 2025 (Chrome); Firefox listing older               | Beta, updated continuously                          |

## What each one does

**Notifier for GitHub** checks GitHub about once a minute and shows the number of unread notifications on its toolbar icon. A click opens github.com/notifications. You can turn on desktop alerts and a sound (both off by default), count only threads you participate in, and limit alerts to repositories of chosen owners. It needs a classic personal access token; fine-grained tokens do not work. It does not list, sort, or change notifications: you triage on GitHub.

**Hush** keeps your notifications in its own inbox. It reads the pull request or issue behind each one and puts the threads that wait on you in **Needs you**, the rest in **FYI**. You mark threads done, snooze, or mute them (Hush does the same on GitHub where GitHub allows it), and act on pull requests in the [peek](/docs/peek). Push goes to every device that you turn on, by default only for Needs you.

## Maintenance

Notifier for GitHub started in 2014 and has about 2,000 stars on GitHub. Its last release was 25.6.25, in June 2025, and its last commit in June 2025. The Chrome Web Store lists 10,000 users. The Firefox listing has version 24.4.24, from April 2024.

## Where Notifier for GitHub is better

- Very small and simple: one badge, one click to GitHub.
- No server: your token stays in your browser.
- Works with GitHub Enterprise Server.
- Checks more often (about once a minute).
- Free, and mature.

## Where Hush is better

- It tells you which threads need you, not only how many are unread.
- Triage in one place: done, snooze, mute, categories, notification views.
- Approve, comment, and merge pull requests from the list.
- Push to your phone, with quiet hours and digests, also when Hush is not open.
- Active development; Notifier for GitHub has had no release since June 2025.

## Choose Notifier for GitHub if…

- A count and a link are all you need, and GitHub's inbox works for you.
- You use GitHub Enterprise Server.
- You want nothing outside your browser to hold your token.

## Choose Hush if…

- The badge never goes to zero, and you want to know what to read first.
- You want categories, snoozes, and pull request actions.
- You want alerts on your phone.

## Sources

- [sindresorhus/notifier-for-github on GitHub](https://github.com/sindresorhus/notifier-for-github): README, MIT license, token, Enterprise
- [Notifier for GitHub releases](https://github.com/sindresorhus/notifier-for-github/releases): 25.6.25, 25 June 2025
- [Default options](https://github.com/sindresorhus/notifier-for-github/blob/main/source/options-storage.js), source code
- [Polling](https://github.com/sindresorhus/notifier-for-github/blob/main/source/background.js), source code
- [Chrome Web Store listing](https://chromewebstore.google.com/detail/notifier-for-github/lmjdlojahmbbcodnpecnjnmlddbkjhnn)
- [Firefox Add-ons listing](https://addons.mozilla.org/en-US/firefox/addon/notifier-for-github/)
- Hush: [inbox](/docs/inbox), [notifications](/docs/notifications), [GitHub access](/docs/github-access), [pricing](/pricing)

_Last checked: 3 October 2026._
