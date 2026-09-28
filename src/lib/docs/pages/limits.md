---
title: Limits, timing, and data
description: How often Hush checks GitHub, what it stores, how long it keeps it, and the limits on views, sections, and devices.
---

## Timing and limits

{{ref:limits}}

Hush checks more often while you use it, because a check costs GitHub requests and Cloudflare requests for each user. When you open Hush after a pause, it checks again within a few seconds.

## What Hush sees

Hush sees what GitHub puts in your notifications, and the facts of the pull requests and issues behind them. It does not read code. Some changes come with no notification (your own review, CI results, new commits after your review); the inbox watcher finds those within 15 minutes, and the dashboards on their next search.

## What Hush stores

- **Your account**: your GitHub login, name, and avatar, and your token, encrypted.
- **Your data**, in storage of its own for each user: your threads and their state, the facts of each PR and issue (CI, reviews, the newest comment), your settings, your alert history, your push devices, and your hidden and moved dashboard items.
- **Sessions and feeds**: a hash of each sign-in session, and your feed addresses.

Hush keeps Done threads until they have had no activity for 30 days, and alerts for 30 days. **Delete account** (Settings → General → Account) deletes all of it at once. Nothing is shared with anyone, and Hush has no analytics.

The browser keeps a copy of your lists, so that Hush opens at once. **Sign out** clears it.

## Open source

Hush is open source: [github.com/ianmatson/hush](https://github.com/ianmatson/hush). It runs on Cloudflare Workers.
