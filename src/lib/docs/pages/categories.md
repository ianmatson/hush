---
title: Categories
description: Sort pull requests and issues into groups of categories, by rules or with Jev. A group gives each item one category, or any number of them.
---

A **category** marks a pull request or issue: its effort, its area, its topic. Categories are in **groups**. A group gives each item one category, or any number of them. Set them up in **Settings → Categories**.

A notification shows the categories of its PR or issue. Hush does not place notifications by themselves.

- Categories show on rows, in the category filter of the [Pull requests and Issues tabs](/docs/pull-requests-and-issues#categories), and in [feeds](/docs/feeds).
- Categories do not change the inbox. They do not make a thread Needs you, FYI, or Muted, and they do not change pushes. To change the inbox, see [What needs you](/docs/inbox#what-needs-you) and [Notification views](/docs/views).

## How Hush places an item

Each group has a setting: **One category per item** or **Any number per item**.

In a group with **One category per item**, Hush checks the categories **from top to bottom**:

1. A category that you chose for the item (right-click → the group's name).
2. The first category whose rule matches.
3. Jev's choice among the categories that have a description. See [smart decisions](/docs/settings#smartdecisions).

When Jev is off or cannot answer, and no rule matches, the item has no category from the group. There is no fallback category. To make one, add a category at the bottom of the group with a rule that matches everything, such as `type:pr OR type:issue`.

In a group with **Any number per item**, Hush checks each category on its own. An item gets every category that you turned on for it, every category whose rule matches, and every category whose description Jev says fits (when Jev is at least 80% sure). A category that you turn off for an item stays off.

Hush checks the rules on the PR or issue only, never on a notification. Categories that you choose for a PR or issue apply to its notifications too.

## The default group

Hush starts with one group, **Effort**, with one category per item: **Low**, **Medium**, and **High**. These categories have a description and no rule, so Jev places each item: the review effort of a pull request, or the work for an issue. You can change or delete the group. The defaults are in [`categoryGroups`](/docs/settings#categorygroups).

## Make a category

In **Settings → Categories**:

- **Add category** in a group adds an empty category. Give it a name, a color, an icon, and a rule, a description for Jev, or both.
- Or right-click a thread in the inbox and choose **Make a category…**: the new category is in your first group, with the thread's repository and type as its rule. Change what you want, and choose **Save**.
- Drag a category up or down to change its order. In a group with one category per item, order matters: the first rule that matches wins.
- **Add category group** adds an empty group. Give it a name, and choose **One category per item** or **Any number per item**.
- **Defaults** puts back the Effort group. Nothing changes until you choose **Save**.

You can have up to 10 groups, with up to 20 categories in each group. A category's id is unique across all groups.

## Rules

A category's rule is a [query](/docs/query-language), such as `repo:acme/website type:pr`. All of its conditions must match, and `OR` matches either side. An empty rule never matches: the category then gets items only from Jev or by hand.

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

Rules cannot use `category:`. They also cannot use `event:`, `needs:`, and `in:`, because these words are about notifications, and rules look only at the PR or issue. Every word and value is in the [query language](/docs/query-language) reference.

## Jev and descriptions

A description tells Jev what belongs in the category, in a few words. Jev reads each item once, when Hush first sees it, and again when its title, description, or labels change. A new comment does not change its categories. When you add or change a description, Jev asks again about that group. To ask again about every category of the items you have now, choose **Re-evaluate items**. Rules without `about:` apply at once.

In a group with any number per item, each description counts as one condition in the limit of 30 `about:` conditions. See [Limits](/docs/limits).

## Examples

The same categories as queries:

| When                         | Category      |
| ---------------------------- | ------------- |
| `repo:acme/website`          | Website       |
| `author:dependabot*`         | Dependencies  |
| `type:issue repo:sveltejs/*` | Svelte issues |
| `label:security`             | Security      |
| `type:pr size:<50`           | Quick         |

In [settings.json](/docs/settings#categorygroups), with an Area group (one per item) and a Topics group (any number per item):

```json settings
{
	"categoryGroups": [
		{
			"id": "area",
			"name": "Area",
			"multiple": false,
			"categories": [
				{
					"id": "website",
					"name": "Website",
					"color": "blue",
					"rule": "repo:acme/website",
					"description": ""
				},
				{
					"id": "dependencies",
					"name": "Dependencies",
					"color": "gray",
					"rule": "author:dependabot*",
					"description": ""
				},
				{
					"id": "svelte",
					"name": "Svelte issues",
					"color": "orange",
					"rule": "type:issue repo:sveltejs/*",
					"description": ""
				}
			]
		},
		{
			"id": "topics",
			"name": "Topics",
			"multiple": true,
			"categories": [
				{
					"id": "security",
					"name": "Security",
					"color": "red",
					"icon": "lucide:shield",
					"rule": "label:security",
					"description": "Vulnerabilities, secrets, permissions, or authentication"
				},
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

A change to `categoryGroups` replaces the whole list, so this example removes the Effort group. Keep it in the list to keep it.

## Feeds

Each category can have an [Atom feed](/docs/feeds) of its open pull requests and issues. Choose the feed button next to it in **Settings → Categories**.

## Tips

- In a group with one category per item, put narrow categories above wide ones. A wide rule at the top (such as `repo:acme/*`) catches everything below it.
- To filter notifications by `in:`, `needs:`, or `event:`, use the inbox [Filter box](/docs/inbox#filter) or a [notification view](/docs/views). They can also use `category:`.
- Give a category a description, and leave its rule empty, to let Jev fill it.
