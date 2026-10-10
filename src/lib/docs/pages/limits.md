---
title: Limits, timing, and data
description: How often Hush checks GitHub, what it stores, how long it keeps it, and the limits on views, categories, and devices.
---

## Timing and limits

{{ref:limits}}

Hush checks more often while you use it, because a check costs GitHub requests and Cloudflare requests for each user. When you open Hush after a pause, it checks again within a few seconds.

## What Hush sees

Hush sees the pull requests and issues of your views, their facts, and what GitHub puts in your notifications about them. It does not read code. Some changes come with no notification (your own review, CI results, new commits after your review); the inbox watcher finds those within 15 minutes, and your views on their next search.

## What Hush stores

- **Your account**: your GitHub login, name, and avatar, and your token, encrypted.
- **Your data**, in storage of its own for each user: your threads and their state, the facts of each PR and issue (CI, reviews, the start of the description, the 2 newest comments), Jev's answers (unless you turned off smart decisions), your pinned categories, your settings, your alert history, when each item last pushed and why, the pushes that wait (quiet hours, a digest, a limit), your push devices, and your hidden and moved dashboard items.
- **Sessions and feeds**: a hash of each sign-in session (with its browser and when it was last used), and a hash of each feed address.

Hush keeps Done threads until they have had no activity for 30 days, and alerts for 30 days. **Delete account** (Settings → General → Account) deletes all of it at once. Nothing is shared with anyone (except TypeSafe's Jev model, unless you turn off [smart decisions](/docs/settings#smartdecisions); see [Privacy](/privacy)), and Hush has no analytics.

The browser keeps a copy of your lists, so that Hush opens at once, and the comments that you did not send yet (see [The comment box](/docs/peek#the-comment-box)). **Sign out** clears both.

## Open source

Hush is open source: [github.com/ianmatson/hush](https://github.com/ianmatson/hush). It runs on Cloudflare Workers.
