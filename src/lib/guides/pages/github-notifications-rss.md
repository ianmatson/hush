---
title: How to follow GitHub notifications in an RSS or Atom reader
description: GitHub has no documented feed for your notifications inbox. Use the Atom feeds for releases and commits, the REST API, or a private Hush feed of a view or a category of your pull requests and issues.
---

## Short answer

**GitHub does not give your notifications inbox an RSS or Atom feed. It has unsupported Atom feeds for public activity, such as `https://github.com/OWNER/REPO/releases.atom`, and a REST API for notifications. Hush gives each view and each category of your pull requests and issues a private Atom feed that you can paste into any feed reader.**

## What GitHub has

### Atom feeds for public activity

Add `.atom` to some GitHub addresses to get a feed:

| Address                                           | Feed of                        |
| ------------------------------------------------- | ------------------------------ |
| `https://github.com/OWNER/REPO/releases.atom`     | The releases of a repository.  |
| `https://github.com/OWNER/REPO/commits/main.atom` | The commits on one branch.     |
| `https://github.com/USER.atom`                    | The public activity of a user. |

A GitHub Docs maintainer wrote that these feeds are "intentionally undocumented and unsupported", so they can change. They do not include your notifications: no review requests, mentions, or CI results.

If you only want to know about releases, you do not need a feed: open the repository's **Watch** menu, choose **Custom**, and select **Releases**.

### The REST API

The notifications API (`GET /notifications`) lists your notification threads. A small script can turn it into a feed, but you must run it, keep a token for it, and decide what each entry says.

## Get a feed of your work with Hush

Hush does not make a feed of raw notifications. It makes a private Atom feed of a [view](/docs/views): the open pull requests and issues that the view's GitHub searches find, with whose turn it is on each one. Each [category](/docs/categories) can have a feed too.

Releases and CI runs are not pull requests or issues, so they are not in a Hush feed. Use GitHub's feeds for them.

1. Sign in at [app.hush-gh.com](https://app.hush-gh.com).
2. Go to **Settings → Views**.
3. Choose the feed button (the RSS icon) next to a view. Hush makes the feed and copies its address.
4. Paste the address in your feed reader, a Slack feed app, or a script.

Hush shows the address **only once**: it keeps only a hash of it. If you lose it, make a new one.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, open the feed button's menu and choose **New feed URL** or **Turn off feed**. The old address stops working at once.

### What each entry has

- The title: whose turn it is and why, and the title of the item, such as "CI failing: Fix login".
- The link: the item's main action on GitHub, such as the files to review.
- The repository, the number, and who wrote the newest comment.
- The author.

The feed has up to 50 open pull requests and issues, newest update first. Items that you snoozed or muted are left out. When an item changes, its entry gets a new ID, so most readers show it as new again. The feed can be up to 2 minutes old. See [Feeds](/docs/feeds).

### A feed for one topic

Make a [view](/docs/views) for the topic, then make a feed of it in **Settings → Views**. For example, a view of the open review requests in one repository:

```json settings
{
	"views": [
		{
			"id": "mine",
			"name": "Mine",
			"searches": ["is:open involves:@me", "is:pr is:open review-requested:@me"],
			"groupBy": "role"
		},
		{
			"id": "web-reviews",
			"name": "Web reviews",
			"searches": ["repo:acme/web is:pr is:open review-requested:@me"],
			"groupBy": "status"
		}
	]
}
```

The feed stops working when you delete the view.

### A feed of open pull requests and issues

Each [category](/docs/categories) can have a feed too, in **Settings → Categories**. It lists the open pull requests and issues in the category, newest update first. For example, a category for small pull requests, in a Size group:

```json settings
{
	"categoryGroups": [
		{
			"id": "size",
			"name": "Size",
			"categories": [
				{
					"id": "quick",
					"name": "Quick",
					"color": "green",
					"rule": "type:pr size:<50",
					"description": ""
				}
			]
		}
	]
}
```

## When to use what

- **Releases of projects that you use:** GitHub's `releases.atom`. It needs no account.
- **Your pull requests and issues, with whose turn it is, in a reader:** a Hush feed of a view.
- **Open pull requests and issues of one kind, in a reader:** a Hush feed of a category.
- **Push to your phone in place of a reader:** see [push notifications for review requests and CI](/guides/github-push-notifications).

## Sources

- [REST API endpoints for feeds](https://docs.github.com/en/rest/activity/feeds), GitHub Docs
- [REST API endpoints for notifications](https://docs.github.com/en/rest/activity/notifications), GitHub Docs
- [Document that atom feeds are available](https://github.com/github/docs/issues/38439), github/docs issue 38439 (the "intentionally undocumented and unsupported" reply)
- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications) (custom watch settings), GitHub Docs

_Last checked: 3 October 2026._
