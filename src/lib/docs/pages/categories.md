---
title: Categories and tags
description: Give every pull request and issue one category, and mark items with tags. A category also decides what the notifications about its items do in the inbox.
---

Every pull request and issue has exactly one **category**: where it lives. It can also have any number of **tags**: what else is true about it. Set them up in **Settings → Categories & tags**.

A notification has the category and the tags of its PR or issue. Hush does not place notifications by themselves.

- Categories show on rows, as filter chips on the [Pull requests and Issues tabs](/docs/pull-requests-and-issues#categories-and-tags), and in [feeds](/docs/feeds).
- A category can also change the inbox: send the notification threads of its items to Needs you, FYI, or Muted, turn pushes on or off, and move new threads to Done or Snoozed. See [Inbox settings](#inbox-settings).
- Tags only mark items. They do not change the inbox.

## How Hush places an item

Hush checks the categories **from top to bottom**:

1. A category that you chose for the item (right-click → **Category**). **Hush decides** removes your choice.
2. The first category whose rule matches.
3. Jev's choice among the categories that have a description, when it is sure enough. See [smart decisions](/docs/settings#smartdecisions).
4. Otherwise **Other** (id `other`). It is always last, and you cannot delete it.

An item gets every tag whose rule matches, plus the tags that you turn on by hand (right-click → **Tags**). A tag that you turn off by hand stays off. Each tag's rule is checked on its own.

Hush checks the rules on the PR or issue only, never on a notification. A category or tags that you choose for a PR or issue apply to its notifications too.

Hush starts with presets that you can change or delete: [categories](/docs/settings#categories) (Incidents, Bugs, Dependencies, Features, Docs, Questions, Maintenance, Other) and [tags](/docs/settings#tags) (Blocked, Needs decision, Security, Breaking change, Quick, Large). Most presets first look for GitHub's usual labels, such as `bug`, `enhancement`, `documentation`, and `dependencies`. When no label matches, Jev reads the item. Dependabot and Renovate PRs go to Dependencies, which does not push.

## Make a category

In **Settings → Categories & tags**:

- **Add category** adds an empty category. Give it a name and a color, and a rule, a description for Jev, or both.
- Or right-click a thread in the inbox and choose **Make a category…**: the new category has the thread's repository and type as its rule, and its threads go to FYI. Change what you want, and choose **Save**.
- Move a category up or down with its buttons. Order matters: the first rule that matches wins.
- **Defaults** puts back the preset categories or tags. Nothing changes until you choose **Save**.

You can have up to 20 categories and 20 tags.

## Rules

A category's or a tag's rule is a [query](/docs/query-language), such as `repo:acme/website type:pr`. All of its conditions must match, and `OR` matches either side. An empty rule never matches: the category then gets items only from Jev or by hand.

| Query word                     | Matches                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `repo:acme/*`                  | The repository. `*` matches anything.                            |
| `author:dependabot*`           | Who opened the PR or issue.                                      |
| `author:bots` / `-author:bots` | The author is a bot, or a person.                                |
| `from:alice`                   | Who did the newest activity: a comment or a review.              |
| `label:bug`                    | Has this label (the exact name, any case).                       |
| `type:pr`                      | What it is: pr or issue.                                         |
| `source:"Involves you"`        | Which [source](/docs/pull-requests-and-issues#sources) found it. |
| `size:<50`                     | Lines changed in a pull request.                                 |
| `about:"database migrations"`  | What it is about, in your words. Jev decides.                    |

Rules cannot use `category:` and `tag:`. They also cannot use `event:`, `needs:`, and `in:`, because these words are about notifications, and rules look only at the PR or issue. Every word and value is in the [query language](/docs/query-language) reference.

Jev reads each item once, when Hush first sees it, and again when its title, description, or labels change. A new comment does not change its category or tags. After you change categories or tags, choose **Re-evaluate items** to ask Jev again about the items you have now. Rules without `about:` apply at once.

## Inbox settings

Each category has three settings for the notification threads of its PRs and issues in the inbox:

| Setting          | JSON                                                     | Does                                                                                                     |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **In the inbox** | `"inbox"`: `"auto"`, `"action"`, `"fyi"`, or `"muted"`   | **Hush decides** (the default), **Always Needs you**, **Always FYI**, or **Muted**.                      |
| **Push**         | `"push"`: `"inherit"`, `"on"`, or `"off"`                | **Use the notification settings** (the default), **Always push** (also FYI), or **Never push**.          |
| **New threads**  | `"triage"`: `"done"`, or `"snooze"` with `"snoozeHours"` | **Keep in the inbox** (the default), **Move to Done**, or **Snooze** for 1 to 720 hours (24 by default). |

**New threads** acts when a thread has new activity or when the category starts to match. If you bring a thread back to the inbox yourself, it stays there until its next activity. A thread that a category moved to Done says “Category: Website”.

A category never sends a thread to GitHub: Muted by a category stays in Hush. **Mute** in the inbox unsubscribes you on GitHub too.

## Inbox rules from before

Inbox rules are gone; categories do their work now. Hush changed your rules into categories for you:

- Each enabled rule is a category at the top of the list, in the same order, with the same name and color gray. A rule with no name is “Rule 1”, “Rule 2”…
- Its conditions are the category's rule, and its effects are the category's inbox settings.
- A rule with no conditions (it matched every thread) puts its effects on **Other**.
- Rules that were off are gone.

A settings file with `rules` imports the same way.

## Examples

As queries, with what the category does in the inbox:

| When                         | Then                     |
| ---------------------------- | ------------------------ |
| `repo:acme/website`          | FYI                      |
| `author:dependabot*`         | Muted                    |
| `type:issue repo:sveltejs/*` | Needs you, always push   |
| `from:github-actions`        | Move to Done             |
| `repo:acme/nightly`          | Snooze 12 hours, no push |

The same categories in [settings.json](/docs/settings#categories):

```json settings
{
	"categories": [
		{
			"id": "website",
			"name": "Website",
			"color": "blue",
			"rule": "repo:acme/website",
			"description": "",
			"inbox": "fyi"
		},
		{
			"id": "dependabot",
			"name": "Dependabot",
			"color": "gray",
			"rule": "author:dependabot*",
			"description": "",
			"inbox": "muted"
		},
		{
			"id": "svelte",
			"name": "Svelte issues",
			"color": "orange",
			"rule": "type:issue repo:sveltejs/*",
			"description": "",
			"inbox": "action",
			"push": "on"
		},
		{
			"id": "bot-comments",
			"name": "Bot comments",
			"color": "gray",
			"rule": "from:github-actions",
			"description": "",
			"triage": "done"
		},
		{
			"id": "nightly",
			"name": "Nightly",
			"color": "teal",
			"rule": "repo:acme/nightly",
			"description": "",
			"push": "off",
			"triage": "snooze",
			"snoozeHours": 12
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	]
}
```

A change to `categories` replaces the whole list, so keep `other`. Tags have only `id`, `name`, `color`, and `rule`:

```json settings
{
	"tags": [
		{ "id": "quick", "name": "Quick", "color": "green", "rule": "type:pr size:<50" },
		{
			"id": "migrations",
			"name": "Migrations",
			"color": "violet",
			"rule": "about:\"database migrations or schema changes\""
		}
	]
}
```

## Feeds

Each category and each tag can have an [Atom feed](/docs/feeds) of its open pull requests and issues. Choose the feed button next to it in **Settings → Categories & tags**.

## Tips

- Put narrow categories above wide ones. A wide rule at the top (such as `repo:acme/*`) catches everything below it.
- To filter notifications by `in:`, `needs:`, or `event:`, use the inbox [Filter box](/docs/inbox#filter) or a [notification view](/docs/views). They can also use `category:` and `tag:`.
- To hear about something without seeing it in Needs you, use **Always FYI** with **Always push**.
- Give a category a description, and leave its rule empty, to let Jev fill it.
