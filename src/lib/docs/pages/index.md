---
title: Hush docs
description: How Hush tracks your GitHub pull requests and issues, and how to make it work your way.
---

Hush tracks the pull requests and issues that your saved GitHub searches find. It shows them in **views**, with whose turn it is on each one. It reads your GitHub notifications to learn quickly when something changes, and sends a push only for the facts that you choose. You can act on GitHub (approve, comment, merge) without leaving Hush.

## What Hush is

Hush is a web app for your GitHub pull requests and issues. It is open source, and it runs at [app.hush-gh.com](https://app.hush-gh.com).

- **Who it is for:** developers who get more GitHub notifications than they can read. For example, people who review pull requests for a team, people who work in large orgs or busy repositories, and maintainers of open-source projects.
- **What you need:** a GitHub account. Any GitHub user can sign in. An org that limits OAuth apps hides its private repositories until an owner approves Hush (see [GitHub access](/docs/github-access)).
- **Where it works:** in any modern browser, on a computer, a tablet, or a phone. You can install it as an app, and get push notifications on each device.
- **What it costs:** Hush is free while it is in beta. See [Pricing](/pricing).
- **Your data:** Hush has no ads and no analytics. See [Privacy](/privacy) and [Security](/security).

## The idea in one minute

- **Views** are tabs of open pull requests and issues from your GitHub searches. Each view puts its items into sections, for example by your role, review status, or category. See [Views](/docs/views).
- **Each item says whose turn it is.** Your review is requested, CI fails on your PR, someone replied to you: these are your turn, and they come first. See [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is).
- **Hush follows up by itself.** When you approve, push a fix, or reply, the item stops being your turn. When it needs you again, it is your turn again.
- **Push only for facts.** You choose the facts that push, such as a review request or failed CI on your PR. See [What gets pushed](/docs/notifications#what-gets-pushed).
- **Snooze, mute, and unread stay in Hush.** They never change your notifications on GitHub. See [Snooze](/docs/pull-requests-and-issues#snooze).
- **Categories sort your work.** [Category groups](/docs/categories) mark each PR and issue, such as its effort, by your rules or with Jev.
- **Everything is a setting.** Views, categories, menus, and keys are in one [settings.json](/docs/settings) that you can edit, export, and share.

## Where to start

- New to Hush: [Getting started](/docs/getting-started).
- An org's repositories are missing: [GitHub access](/docs/github-access).
- Too many pushes, or not enough: [Notifications](/docs/notifications).
- An item is missing, or in the wrong section: [Troubleshooting](/docs/troubleshooting).
- You like the keyboard: [Keybinds](/docs/keybinds).
- You want every option: [settings.json](/docs/settings).

## For agents

Every page is also plain Markdown: add `.md` to its address (for example [/docs/settings.md](/docs/settings.md)). [/llms.txt](/llms.txt) lists the pages, and [/llms-full.txt](/llms-full.txt) has all of them in one file. To change a user's setup, read [For agents](/docs/agents) first.
