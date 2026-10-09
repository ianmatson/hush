---
title: How to stop Dependabot and bot notification noise on GitHub
description: Get fewer Dependabot pull requests with groups and a schedule, choose where Dependabot alerts go, filter bot notifications in the inbox, and keep bot pull requests in FYI with Hush.
---

## Short answer

**In `.github/dependabot.yml`, use `groups` and a weekly `schedule`, so Dependabot opens a few grouped pull requests in place of many. In your notification settings, choose where Dependabot alerts go. In Hush, pull requests that bots open are FYI by default, so they do not push. Mute a thread to stop it on GitHub too.**

## Why Dependabot is noisy

Dependabot makes three kinds of notifications: **version updates** (a pull request for each new version of a dependency), **security updates** (a pull request that fixes a vulnerable dependency), and **alerts**. Each pull request also brings CI runs, rebases, and comments. In a repository that you watch, you get all of it.

## Step 1: Get fewer pull requests

If you maintain the repository, change `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        patterns:
          - '*'
        update-types:
          - 'minor'
          - 'patch'
```

- `groups` puts the updates that match into **one pull request**. This example groups all minor and patch updates; major updates still come one by one.
- `schedule.interval` is how often Dependabot looks for new versions. `daily` runs each weekday; `weekly` runs once a week, on Monday by default. `monthly` and longer intervals are also possible.
- `open-pull-requests-limit` is the most version update pull requests that are open at one time. The default is 5. `0` turns version updates off for that ecosystem; security updates still come.

## Step 2: Choose where Dependabot alerts go

1. Open [Notification settings](https://github.com/settings/notifications).
2. Under **Dependabot alerts**, choose **On GitHub**, **Email**, or both, or turn them off.
3. For email, you can choose a **weekly digest** in place of one email for each alert.

GitHub sends a web notification for alerts when Dependabot is turned on for a repository, when a new manifest file is added, and when a new vulnerability of critical or high severity is found.

## Step 3: Filter the inbox

GitHub's inbox has these filters for Dependabot:

| Filter                              | Shows                                                 |
| ----------------------------------- | ----------------------------------------------------- |
| `author:app/dependabot`             | Everything Dependabot made: alerts and pull requests. |
| `is:repository-vulnerability-alert` | Dependabot alerts only.                               |

The inbox cannot **leave out** an author: filters do not support `-` or `NOT`. To clear Dependabot's notifications, filter with `author:app/dependabot`, select all, and choose **Done**. To stop notifications from one pull request, choose **Unsubscribe**.

If you only read a repository, set its **Watch** menu to **Participating and @mentions**. Then you get a Dependabot pull request only when you take part in it: for example, when you are asked to review it, are assigned to it, or are mentioned.

## When GitHub is enough

Grouped updates and a weekly schedule often cut Dependabot's pull requests to a few each week. If that is a list that you can read, you do not need more.

## Where Hush helps

Hush treats bots differently by default, with [`botsAreFyi`](/docs/settings#botsarefyi) on:

- Pull requests that bots open are **FYI**, unless they ask for your review by name.
- Comments and mentions by bots do not count as replies to you.
- On the [Pull requests tab](/docs/pull-requests-and-issues), bot pull requests are left out ([`dash.hideBots`](/docs/settings#dash-hidebots)), unless your review is requested by name or the pull request is assigned to you. Hush then does not track them, so their notifications do not come in to the inbox either. Turn off **Hide PRs and issues that bots opened** in **Settings → Sources** to get them.

A bot is a login that ends in `[bot]`, or that starts with dependabot, renovate, github-actions, or codecov.

Dependabot **alerts** do not come in to Hush: Hush keeps only notifications about pull requests and issues. Read alerts on GitHub, or by email (Step 2).

To keep bot pull requests out of Needs you, keep `botsAreFyi` on:

```json settings
{ "botsAreFyi": true }
```

- To see bot activity in one place, make a [notification view](/docs/views) with `from:bots`, or leave bots out of a view with `-author:bots`. `author:dependabot*` matches the login `dependabot[bot]`: `author:` matches who opened a pull request or issue.
- To stop one thread, choose **Mute** on it: Hush also unsubscribes you on GitHub.
- A [category](/docs/categories) with the rule `author:dependabot*` marks Dependabot pull requests on their rows, and gives them a filter and a feed. Categories do not change the inbox: they do not make a thread FYI or Muted.

## Sources

- [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference), GitHub Docs
- [Optimizing the creation of pull requests for Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/optimizing-pr-creation-version-updates), GitHub Docs
- [Configuring notifications for Dependabot alerts](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configuring-notifications-for-dependabot-alerts), GitHub Docs
- [Inbox filters](https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters), GitHub Docs
- [Managing your subscriptions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-subscriptions-for-activity-on-github/managing-your-subscriptions), GitHub Docs

_Last checked: 3 October 2026._
