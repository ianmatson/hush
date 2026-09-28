---
title: Hush docs
description: How Hush finds what is your turn on GitHub, and how to make it work your way.
---

Hush reads your GitHub notifications and the pull requests and issues behind them, and tells you **whose turn it is**. It shows what waits on you, what waits on others, and the rest as a feed. It pushes only when something becomes your turn, and lets you act on GitHub (approve, comment, merge) without leaving Hush.

## The idea in one minute

- **Your turn** is short on purpose. An item is there only when you are the next person who must act: your review is requested, CI fails on your PR, someone replied to you, your approved PR is ready to merge. See [Your turn](/docs/your-turn).
- **Waiting** is what you did your part on: your PR waits for review, you asked a question. It is grouped by whom it waits on.
- **Updates** is everything else, as a feed: team mentions, watched repositories, bots, merged and closed work. Nothing there needs you.
- **Done lasts until it is your turn again.** Hush also finishes items for you: when you approve, push a fix, or reply, the item leaves Your turn with a note such as “✓ You approved”.
- **When Hush is wrong, say so.** **Not my turn** on an item asks why, and fixes the setting or adds the rule that would have been right.
- **Everything is a setting.** Rules, searches, menus, and keys are in one [settings.json](/docs/settings) that you can edit, export, and share.

## Where to start

- New to Hush: [Getting started](/docs/getting-started).
- An org's repositories are missing: [GitHub access](/docs/github-access).
- Too much noise, or not enough: [Your turn](/docs/your-turn#not-my-turn), [Rules](/docs/rules), and [Notifications](/docs/notifications).
- You like the keyboard: [Keybinds](/docs/keybinds).
- You want every option: [settings.json](/docs/settings).

## For agents

Every page is also plain Markdown: add `.md` to its address (for example [/docs/settings.md](/docs/settings.md)). [/llms.txt](/llms.txt) lists the pages, and [/llms-full.txt](/llms-full.txt) has all of them in one file. To change a user's setup, read [For agents](/docs/agents) first.
