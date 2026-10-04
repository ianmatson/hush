---
title: Feeds
description: Read a category or a tag in any feed reader, with a private Atom feed.
---

Each [category and tag](/docs/pull-requests-and-issues#categories-and-tags) can be an Atom feed. Use it in a feed reader, a Slack feed app, or a script.

## Make a feed

1. Go to **Settings → Categories & tags**.
2. Choose the feed button (the RSS icon) next to a category or a tag. Hush makes the feed and copies its address.
3. Paste the address in your feed reader.

Hush shows the address **only this once**: it keeps only a hash of it. Copy it from the message if the copy did not work. If you lose it, make a new one.

The feed button of a category or tag with a feed has a menu: **New feed URL** and **Turn off feed**.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, choose **New feed URL** or **Turn off feed**: the old address stops working at once.

## What is in a feed

The feed has the open pull requests and issues that are in the category or have the tag now, up to 50, newest update first. Items that you hid are left out. Each entry has:

- The title: the turn reason and the item's title, such as “CI failing: Fix login”.
- The link: the item's main action on GitHub.
- The repository, the number, and who wrote the newest comment.
- The author.

When an item changes, its entry gets a new ID, so most readers show it as new again. Feed readers usually check every few minutes; the feed can be up to 2 minutes old. A feed stops working when you delete its category or tag.
