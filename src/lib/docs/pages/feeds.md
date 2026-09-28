---
title: Feeds
description: Read an inbox tab in any feed reader, with a private Atom feed.
---

Any inbox tab can be an Atom feed: Needs you, FYI, Needs you + FYI, or one of your [saved views](/docs/views). Use it in a feed reader, a Slack feed app, or a script.

## Make a feed

1. Go to **Settings → Inbox → Views and feeds**.
2. Choose the feed button (the RSS icon) next to a tab. Hush makes the feed and copies its address.
3. Paste the address in your feed reader.

Hush shows the address **only this once**: it keeps only a hash of it. Copy it from the message if the copy did not work. If you lose it, make a new one.

The feed button of a tab with a feed has a menu: **New feed URL** and **Turn off feed**.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, choose **New feed URL** or **Turn off feed**: the old address stops working at once.

## What is in a feed

The feed has the threads that are in the tab now, newest first. Each entry has:

- The title: what happened and the thread's title, such as “CI failed on your PR: Fix login”.
- The link: the thread's main action on GitHub.
- The repository, the number, why GitHub notified you, and the newest comment.
- The author, and the list (`action` or `fyi`) as a category.

Feed readers usually check every few minutes; the feed can be up to 2 minutes old. A feed of a saved view stops working when you delete the view.
