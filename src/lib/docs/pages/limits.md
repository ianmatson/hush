---
title: Limits, timing, and data
description: How often Hush checks GitHub, what it stores, how long it keeps it, and the limits on rules, searches, and devices.
---

## Timing and limits

{{ref:limits}}

Hush checks more often while you use it, because a check costs GitHub requests and Cloudflare requests for each user. When you open Hush after a pause, it checks again within a few seconds.

## What Hush sees

Hush sees what GitHub puts in your notifications, and the facts of the pull requests and issues behind them. It does not read code. Some changes come with no notification (your own review, CI results, new commits after your review); the watcher finds those within 15 minutes, and the [tracked searches](/docs/where-hush-looks) find items with no recent notification.

## What Hush stores

- **Your account**: your GitHub login, name, and avatar, and your token, encrypted.
- **Your data**, in storage of its own for each user: your items and what you did with them, the facts of each PR and issue (CI, reviews, the newest comment), what each item looked like when you last saw it, your settings, your alert history, and your push devices.
- **Sessions and feeds**: a hash of each sign-in session (with its browser and when it was last used), and a hash of each feed address.

Hush keeps updates, and Done or muted items, until they have had no activity for 30 days, and alerts for 30 days. **Delete account** (Settings → Account) deletes all of it at once. Nothing is shared with anyone, and Hush has no analytics.

The browser keeps a copy of your lanes, so that Hush opens at once. **Sign out** clears it.

## Open source

Hush is open source: [github.com/ianmatson/hush](https://github.com/ianmatson/hush). It runs on Cloudflare Workers.
