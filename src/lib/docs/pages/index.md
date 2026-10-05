---
title: Hush docs
description: How Hush sorts your GitHub notifications, and how to make it work your way.
---

Hush tracks the pull requests and issues that your saved GitHub searches find, reads your GitHub notifications about them, and sorts them into what **needs you** and what is only **FYI**. It follows whose turn it is on every pull request and issue that involves you, sends a push only when something waits on you, and lets you act on GitHub (approve, comment, merge, mark Done) without leaving your inbox.

## What Hush is

Hush is a web app for your GitHub notifications. It replaces the notifications page on github.com. It is open source, and it runs at [app.hush-gh.com](https://app.hush-gh.com).

- **Who it is for:** developers who get more GitHub notifications than they can read. For example, people who review pull requests for a team, people who work in large orgs or busy repositories, and maintainers of open-source projects.
- **What you need:** a GitHub account. Any GitHub user can sign in. An org that limits OAuth apps hides its private repositories until an owner approves Hush (see [GitHub access](/docs/github-access)).
- **Where it works:** in any modern browser, on a computer, a tablet, or a phone. You can install it as an app, and get push notifications on each device.
- **What it costs:** Hush is free while it is in beta. See [Pricing](/pricing).
- **Your data:** Hush has no ads and no analytics. See [Privacy](/privacy) and [Security](/security).

## The idea in one minute

- **Needs you** is short on purpose. A thread is there only when you are the next person who must act: your review is requested, CI fails on your PR, someone replied to you, your approved PR is ready to merge. See [what needs you](/docs/inbox#what-needs-you).
- **FYI** is everything else: team mentions, watched repositories, bots, merged and closed work.
- **Whose turn** is one set of rules for the inbox and the [Pull requests and Issues tabs](/docs/pull-requests-and-issues). An item is in Needs you exactly when it is “Your turn”.
- **Hush follows up by itself.** When you approve, push a fix, or reply, the thread leaves Needs you with a note such as “✓ You approved”. When it needs you again, it comes back.
- **Categories sort everything.** Every PR and issue has one [category](/docs/categories), and its notifications have the same category. A category can send its notifications to FYI, mute them, or push them.
- **Everything is a setting.** Categories, tags, views, sources, menus, and keys are in one [settings.json](/docs/settings) that you can edit, export, and share.

## Where to start

- New to Hush: [Getting started](/docs/getting-started).
- An org's repositories are missing: [GitHub access](/docs/github-access).
- Too much noise, or not enough: [Categories and tags](/docs/categories) and [Notifications](/docs/notifications).
- You like the keyboard: [Keybinds](/docs/keybinds).
- You want every option: [settings.json](/docs/settings).

## For agents

Every page is also plain Markdown: add `.md` to its address (for example [/docs/settings.md](/docs/settings.md)). [/llms.txt](/llms.txt) lists the pages, and [/llms-full.txt](/llms-full.txt) has all of them in one file. To change a user's setup, read [For agents](/docs/agents) first.
