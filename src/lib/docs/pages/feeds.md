---
title: Feeds
description: Read a view or a category in any feed reader, with a private Atom feed.
---

Each [view](/docs/views) can be an Atom feed, and so can each [category](/docs/categories). Use it in a feed reader, a Slack feed app, or a script.

## Make a feed

1. Go to **Settings → Views** for a view, or **Settings → Categories** for a category.
2. Choose the feed button (the RSS icon) next to it. Hush makes the feed and copies its address.
3. Paste the address in your feed reader.

Hush shows the address **only this once**: it keeps only a hash of it. Copy it from the message if the copy did not work. If you lose it, make a new one.

The feed button of a view or category with a feed has a menu: **New feed URL** and **Turn off feed**.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, choose **New feed URL** or **Turn off feed**: the old address stops working at once.

## What is in a feed

The feed of a view or a category has the open pull requests and issues that are in it now, up to 50, newest update first. Items that you snoozed or muted are left out. Each entry has:

- The title: the turn reason and the item's title, such as “CI failing: Fix login”.
- The link: the item's main action on GitHub.
- The repository, the number, and who wrote the newest comment.
- The author.

When an entry changes, it gets a new ID, so most readers show it as new again. Feed readers usually check every few minutes; the feed can be up to 2 minutes old. A feed stops working when you delete its view or category.
