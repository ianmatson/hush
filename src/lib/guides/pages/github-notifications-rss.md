---
title: How to follow GitHub notifications in an RSS or Atom reader
description: GitHub has no documented feed for your notifications inbox. Use the Atom feeds for releases and commits, the REST API, or a private Hush feed of your Needs you list, FYI, or a notification view.
---

## Short answer

**GitHub does not give your notifications inbox an RSS or Atom feed. It has unsupported Atom feeds for public activity, such as `https://github.com/OWNER/REPO/releases.atom`, and a REST API for notifications. Hush gives each inbox tab and each notification view a private Atom feed that you can paste into any feed reader.**

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

## Get a feed of your notifications with Hush

Hush can make a private Atom feed of any inbox tab: **Needs you**, **FYI**, **Needs you + FYI**, or one of your [notification views](/docs/views).

Hush keeps only the notifications about the pull requests and issues that your [sources](/docs/pull-requests-and-issues#sources) find. Releases and CI runs do not come in, so use GitHub's feeds for them.

1. Sign in at [app.hush-gh.com](https://app.hush-gh.com).
2. Go to **Settings → Inbox → Views and feeds**.
3. Choose the feed button (the RSS icon) next to a tab. Hush makes the feed and copies its address.
4. Paste the address in your feed reader, a Slack feed app, or a script.

Hush shows the address **only once**: it keeps only a hash of it. If you lose it, make a new one.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, open the feed button's menu and choose **New feed URL** or **Turn off feed**. The old address stops working at once.

### What each entry has

- The title: what happened and the title of the thread, such as "CI failed on your PR: Fix login".
- The link: the thread's main action on GitHub, such as the files to review.
- The repository, the number, why GitHub notified you, and the newest comment.
- The author, and the list (`action` or `fyi`) as a category.

The feed has the threads that are in the tab now, newest first. A thread that you mark Done leaves the feed. When a thread has new activity, its entry gets a new ID, so most readers show it as new again. The feed can be up to 2 minutes old. See [Feeds](/docs/feeds).

### A feed for one topic

Make a notification view, then make a feed of it. For example, a view of the review requests in one repository, and a view of the notifications about items with high effort:

```json settings
{
	"views": [
		{
			"id": "webreviews",
			"name": "Web reviews",
			"base": "action",
			"query": "repo:acme/web needs:review"
		},
		{ "id": "big", "name": "Big work", "base": "inbox", "query": "category:high-effort" }
	]
}
```

The feed of a view stops working when you delete the view.

### A feed of open pull requests and issues

Each [category](/docs/categories) can have a feed too, in **Settings → Categories**. It lists the open pull requests and issues in the category, newest update first. For example, a category for small pull requests, in a group with any number per item:

```json settings
{
	"categoryGroups": [
		{
			"id": "size",
			"name": "Size",
			"multiple": true,
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
- **Your own notifications, sorted, in a reader:** a Hush feed of Needs you or a notification view.
- **Open pull requests and issues of one kind, in a reader:** a Hush feed of a category.
- **Push to your phone in place of a reader:** see [push notifications for review requests and CI](/guides/github-push-notifications).

## Sources

- [REST API endpoints for feeds](https://docs.github.com/en/rest/activity/feeds), GitHub Docs
- [REST API endpoints for notifications](https://docs.github.com/en/rest/activity/notifications), GitHub Docs
- [Document that atom feeds are available](https://github.com/github/docs/issues/38439), github/docs issue 38439 (the "intentionally undocumented and unsupported" reply)
- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications) (custom watch settings), GitHub Docs

_Last checked: 3 October 2026._
