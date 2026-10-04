---
title: Hush docs
description: How Hush follows whose turn it is on your GitHub pull requests and issues, and how to make it work your way.
---

Hush follows whose turn it is on every pull request and issue that involves you. It groups them by turn, sorts them into categories and tags, sends a push only when something waits on you, and lets you act on GitHub (approve, comment, merge) without leaving Hush.

## What Hush is

Hush is a web app for the GitHub pull requests and issues that need you. It can replace the notifications page on github.com. It is open source, and it runs at [app.hush-gh.com](https://app.hush-gh.com).

- **Who it is for:** developers who get more GitHub notifications than they can read. For example, people who review pull requests for a team, people who work in large orgs or busy repositories, and maintainers of open-source projects.
- **What you need:** a GitHub account. Any GitHub user can sign in. An org that limits OAuth apps hides its private repositories until an owner approves Hush (see [GitHub access](/docs/github-access)).
- **Where it works:** in any modern browser, on a computer, a tablet, or a phone. You can install it as an app, and get push notifications on each device.
- **What it costs:** Hush is free while it is in beta. See [Pricing](/pricing).
- **Your data:** Hush has no ads and no analytics. See [Privacy](/privacy) and [Security](/security).

## The idea in one minute

- **Your turn** is short on purpose. An item is there only when you are the next person who must act: your review is requested, CI fails on your PR, someone replied to you, your approved PR is ready to merge. See [Whose turn](/docs/turns#what-is-your-turn).
- **The rest waits on others**, or is only for your information: team review requests, PRs that you reviewed, drafts, bots.
- **Sources** decide what Hush tracks, and **categories and tags** sort it. See [Pull requests and issues](/docs/pull-requests-and-issues).
- **Hush follows up by itself.** When you approve, push a fix, or reply, the item leaves Your turn. When it needs you again, it comes back, and Hush can push it.
- **Everything is a setting.** Sources, categories, tags, menus, and keys are in one [settings.json](/docs/settings) that you can edit, export, and share.

## Where to start

- New to Hush: [Getting started](/docs/getting-started).
- An org's repositories are missing: [GitHub access](/docs/github-access).
- Too much noise, or not enough: [Categories and tags](/docs/pull-requests-and-issues#categories-and-tags) and [Notifications](/docs/notifications).
- You like the keyboard: [Keybinds](/docs/keybinds).
- You want every option: [settings.json](/docs/settings).

## For agents

Every page is also plain Markdown: add `.md` to its address (for example [/docs/settings.md](/docs/settings.md)). [/llms.txt](/llms.txt) lists the pages, and [/llms-full.txt](/llms-full.txt) has all of them in one file. To change a user's setup, read [For agents](/docs/agents) first.
