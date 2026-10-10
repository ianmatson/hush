---
title: How to stop Dependabot and bot notification noise on GitHub
description: Get fewer Dependabot pull requests with groups and a schedule, choose where Dependabot alerts go, filter bot notifications in the inbox, and keep bot pull requests out of your Hush views.
---

## Short answer

**In `.github/dependabot.yml`, use `groups` and a weekly `schedule`, so Dependabot opens a few grouped pull requests in place of many. In your notification settings, choose where Dependabot alerts go. Hush leaves pull requests that bots open out of your views by default, and never counts a bot's comment as a reply to you.**

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

Hush treats bots differently, with no setting to change:

- A pull request that a bot opens is not your turn, unless it asks for your review by name. Its row says “Bot PR”.
- A comment by a bot is not a reply to you, and it never pushes.
- In your [views](/docs/views), bot pull requests and issues are left out by default ([`dash.hideBots`](/docs/settings#dash-hidebots)), unless your review is requested or you are assigned. Turn off **Hide PRs and issues that bots opened** in **Settings → Views → Filters** to see them.

A bot is a login that ends in `[bot]`, or that starts with dependabot, renovate, github-actions, or codecov.

Dependabot **alerts** do not show in Hush: Hush shows only pull requests and issues. Read alerts on GitHub, or by email (Step 2).

To see the Dependabot pull requests of one repository in one place, turn off hidden bots, and add a [view](/docs/views) for them. Then `-author:app/dependabot` keeps them out of your other views:

```json settings
{
	"dash": { "hideBots": false },
	"views": [
		{
			"id": "mine",
			"name": "Mine",
			"searches": [
				"is:open involves:@me -author:app/dependabot",
				"is:pr is:open review-requested:@me"
			],
			"groupBy": "role"
		},
		{
			"id": "deps",
			"name": "Dependencies",
			"searches": ["repo:acme/web is:pr is:open author:app/dependabot"],
			"groupBy": "status"
		}
	]
}
```

To take one pull request out of your views, choose **Mute** on it. Mute stays in Hush: GitHub still notifies you. To stop GitHub's notifications for it too, choose **Unsubscribe** on GitHub.

A [category](/docs/categories) marks Dependabot pull requests on their rows, and gives them a filter and a feed. Give it this rule:

```query
author:dependabot* type:pr
```

`author:` matches who opened a pull request or issue, so `author:dependabot*` matches the login `dependabot[bot]`. Categories do not change whose turn it is.

## Sources

- [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference), GitHub Docs
- [Optimizing the creation of pull requests for Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/optimizing-pr-creation-version-updates), GitHub Docs
- [Configuring notifications for Dependabot alerts](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configuring-notifications-for-dependabot-alerts), GitHub Docs
- [Inbox filters](https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters), GitHub Docs
- [Managing your subscriptions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-subscriptions-for-activity-on-github/managing-your-subscriptions), GitHub Docs

_Last checked: 3 October 2026._
