---
title: How to follow GitHub notifications in an RSS or Atom reader
description: GitHub has no documented feed for your notifications inbox. Use the Atom feeds for releases and commits, the REST API, or a private Hush feed of a category or a tag of your pull requests and issues.
---

## Short answer

**GitHub does not give your notifications inbox an RSS or Atom feed. It has unsupported Atom feeds for public activity, such as `https://github.com/OWNER/REPO/releases.atom`, and a REST API for notifications. Hush gives each category and each tag of your pull requests and issues a private Atom feed that you can paste into any feed reader.**

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

## Get a feed of your pull requests and issues with Hush

Hush sorts the pull requests and issues that involve you into [categories and tags](/docs/pull-requests-and-issues#categories-and-tags). Each category and each tag can have a private Atom feed.

1. Sign in at [app.hush-gh.com](https://app.hush-gh.com).
2. Go to **Settings → Categories & tags**.
3. Choose the feed button (the RSS icon) next to a category or a tag. Hush makes the feed and copies its address.
4. Paste the address in your feed reader, a Slack feed app, or a script.

Hush shows the address **only once**: it keeps only a hash of it. If you lose it, make a new one.

**Keep the address secret.** Anyone who has it can read the feed, with no sign-in. If it leaks, open the feed button's menu and choose **New feed URL** or **Turn off feed**. The old address stops working at once.

### What each entry has

- The title: the turn reason and the title of the item, such as "CI failing: Fix login".
- The link: the item's main action on GitHub, such as the files to review.
- The repository, the number, and who wrote the newest comment.
- The author.

The feed has the open items that are in the category or have the tag now, newest update first. An item that you hide leaves the feed. When an item changes, its entry gets a new ID, so most readers show it as new again. The feed can be up to 2 minutes old. See [Feeds](/docs/feeds).

### A feed for one topic

Make a tag, then make a feed of it. For example, a tag for one repository, and a tag for failing CI on your pull requests:

```json settings
{
	"tags": [
		{ "id": "web", "name": "Web", "color": "blue", "rule": "repo:acme/web" },
		{ "id": "broken-ci", "name": "Broken CI", "color": "red", "rule": "needs:fix-ci" }
	]
}
```

A change to `tags` replaces the whole list, so write the tags that you keep too. The feed of a tag stops working when you delete the tag.

## When to use what

- **Releases of projects that you use:** GitHub's `releases.atom`. It needs no account.
- **Your own pull requests and issues, sorted, in a reader:** a Hush feed of a category or a tag.
- **Push to your phone in place of a reader:** see [push notifications for review requests and CI](/guides/github-push-notifications).

## Sources

- [REST API endpoints for feeds](https://docs.github.com/en/rest/activity/feeds), GitHub Docs
- [REST API endpoints for notifications](https://docs.github.com/en/rest/activity/notifications), GitHub Docs
- [Document that atom feeds are available](https://github.com/github/docs/issues/38439), github/docs issue 38439 (the "intentionally undocumented and unsupported" reply)
- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications) (custom watch settings), GitHub Docs

_Last checked: 3 October 2026._
