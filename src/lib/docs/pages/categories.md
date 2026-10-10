---
title: Categories
description: Sort pull requests and issues into groups of categories, by rules or with Jev. Each item gets one category from each group.
---

A **category** marks a pull request or issue: its effort, its area, its topic. Categories are in **groups**. Each item gets one category from each group. Set them up in **Settings → Categories**.

- Categories show on rows, in the category filter of your [views](/docs/pull-requests-and-issues#categories), and in [feeds](/docs/feeds).
- A view can put its items into sections by a category group: see [Group by](/docs/pull-requests-and-issues#group-by).
- Categories do not change whose turn it is, and they do not change pushes. See [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is).

## How Hush places an item

Hush checks the categories of each group **from top to bottom**:

1. A category that you chose for the item (right-click → the group's name).
2. The first category whose rule matches.
3. Jev's choice among the categories that have a description. See [smart decisions](/docs/settings#smartdecisions).

When no rule matches, and Jev is off or cannot answer, the item is **Not sorted** in that group: it has no category from the group. To see these items, choose **Not sorted** under the group in the category filter of a [view](/docs/pull-requests-and-issues#categories). There is no fallback category. To make one, add a category at the bottom of the group with a rule that matches everything, such as `type:pr OR type:issue`.

## The default group

Hush starts with two groups, each with three categories: **Low**, **Medium**, and **High**. These categories have a description and no rule, so Jev places each item.

- **Effort**: the review effort of a pull request, or the work for an issue.
- **Impact**: how much the item changes for the people who use the product. A bug fix removes a problem, and a feature adds something. Both can have a low or a high impact.

You can change or delete the groups. The defaults are in [`categoryGroups`](/docs/settings#categorygroups).

## Make a category

In **Settings → Categories**:

- **Add category** in a group adds an empty category. Give it a name, a color, an icon, and a rule, a description for Jev, or both.
- Drag a category up or down to change its order. Order matters: the first rule that matches wins.
- **Add category group** adds an empty group. Give it a name.
- **Defaults** puts back the Effort and Impact groups. Nothing changes until you choose **Save**.

You can have up to 10 groups, with up to 20 categories in each group. A category's id is unique across all groups.

## Rules

A category's rule is a [query](/docs/query-language), such as `repo:acme/website type:pr`. All of its conditions must match, and `OR` matches either side. An empty rule never matches: the category then gets items only from Jev or by hand.

| Query word                     | Matches                                             |
| ------------------------------ | --------------------------------------------------- |
| `repo:acme/*`                  | The repository. `*` matches anything.               |
| `author:dependabot*`           | Who opened the PR or issue.                         |
| `author:bots` / `-author:bots` | The author is a bot, or a person.                   |
| `from:alice`                   | Who did the newest activity: a comment or a review. |
| `label:bug`                    | Has this label (the exact name, any case).          |
| `type:pr`                      | What it is: pr or issue.                            |
| `view:Mine`                    | Which [view](/docs/views) has it.                   |
| `size:<50`                     | Lines changed in a pull request.                    |
| `about:"database migrations"`  | What it is about, in your words. Jev decides.       |

Rules cannot use `category:`. Every word and value is in the [query language](/docs/query-language) reference.

## Jev and descriptions

Jev works only when [smart decisions](/docs/settings#smartdecisions) are on (the default). The switch is in **Settings → Categories → Smart decisions**.

A description tells Jev what belongs in the category, in a few words. Jev chooses one of the categories in the group that have a description, so it needs two or more of them; with only one, Jev does not choose. For a yes-or-no category, such as “Security”, write `about:"…"` in its rule instead: Jev then answers yes or no for that category alone.

Jev reads each item once, when Hush first sees it, and again when its title, description, or labels change. A new comment does not change its categories. When you add or change a description, Jev asks again about that group. To ask again about every category of the items you have now, choose **Re-evaluate items**. Rules without `about:` apply at once.

## Examples

The same categories as queries:

| When                         | Category      |
| ---------------------------- | ------------- |
| `repo:acme/website`          | Website       |
| `author:dependabot*`         | Dependencies  |
| `type:issue repo:sveltejs/*` | Svelte issues |
| `label:security`             | Security      |
| `type:pr size:<50`           | Quick         |

In [settings.json](/docs/settings#categorygroups), with an Area group and a Risk group:

```json settings
{
	"categoryGroups": [
		{
			"id": "area",
			"name": "Area",
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
			"id": "risk",
			"name": "Risk",
			"categories": [
				{
					"id": "security",
					"name": "Security",
					"color": "red",
					"icon": "lucide:shield",
					"rule": "label:security",
					"description": "Vulnerabilities, secrets, permissions, or authentication"
				}
			]
		}
	]
}
```

A change to `categoryGroups` replaces the whole list, so this example removes the Effort and Impact groups. Keep them in the list to keep them.

## Feeds

Each category can have an [Atom feed](/docs/feeds) of its open pull requests and issues. Choose the feed button next to it in **Settings → Categories**.

## Tips

- Put narrow categories above wide ones. A wide rule at the top (such as `repo:acme/*`) catches everything below it.
- Give a category a description, and leave its rule empty, to let Jev fill it.
