---
title: Query language
description: The one-line syntax of category rules, with every word and value.
---

One short syntax writes the rules of [categories](/docs/categories#rules):

```query
repo:acme/* type:pr -author:bots label:"good first issue" login bug
```

Write a rule as text, or build it one condition at a time in **Settings → Categories**. Both make the same query. The searches of [views](/docs/views) do not use this syntax: they are GitHub searches.

## Syntax

- `word:value` is a condition. All conditions must match.
- `word:a,b` (or the same word twice) matches **any** of the values: `repo:acme/web,acme/api`.
- `OR` (in capitals) matches when either side matches: `label:bug OR label:crash`.
- Parentheses group conditions: `repo:acme/web (label:bug OR author:alice)`.
- `-` in front of a condition or a group means “not”: `-label:wontfix`, `-(label:a OR label:b)`.
- `@me` means you, wherever a login goes: `author:@me`, `assignee:@me`, `review-requested:@me`.
- `*` matches anything, and `?` one character, in `repo:`, `author:`, and `from:`: `repo:acme/*`, `author:dependabot*`.
- Quote a value that has spaces or commas: `label:"good first issue"`.
- `author:bots` and `from:bots` mean any bot. `-author:bots` and `-from:bots` mean a person.
- `is:draft` and `-is:draft`; `is:open`, `is:closed`, `is:merged`.
- Other words must all be in the title, the repository, or the author. They are not case-sensitive.

When a part has an error (an unknown word, a value that does not exist), Hush says so and does not save the rule. While you type, suggestions show the words and their values; ↑ and ↓ move, Enter or Tab picks one, and Esc closes the list.

## Words

{{ref:query}}

## `author:` and `from:`

- `author:` is who **opened** the PR or issue.
- `from:` is who did the **newest activity** on it: the newest comment or review. New commits count as activity too, but GitHub does not say who pushed them, so `from:` does not match them.

For example, `from:github-actions` finds the items where the newest thing is a comment by GitHub Actions.

## `about:`

`about:` says in your own words what a PR or issue is about:

```query
about:"database migrations or schema changes"
```

It needs [smart decisions](/docs/settings#smartdecisions) on. Jev, a decision model, reads the title, labels, start of the description, and last 2 comments, and decides whether the item is about what you wrote. It matches only when Jev is sure.

- Use it in the rules of [categories](/docs/categories#rules). Hush checks the condition when you save, and again when an item's text changes.
- Put exact words first where you can: in `repo:acme/api about:"migrations"`, Jev reads only the items of acme/api.
- Up to 30 different `about:` conditions in all your categories, each up to 200 characters.

## `category:`

The rules of categories cannot use `category:`: a rule cannot depend on another category. There is no `tag:`: an item has one category from each group.

## Examples

| Query                              | Finds                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| `repo:acme/*`                      | Everything in the acme org.                                        |
| `type:pr -author:bots`             | Pull requests that people opened.                                  |
| `type:pr is:open author:alice`     | Open PRs that Alice opened.                                        |
| `review-requested:acme/web`        | Items where the acme/web team's review is requested.               |
| `assignee:@me repo:acme/web`       | Items assigned to you in one repository.                           |
| `from:bots`                        | Items where a bot did the newest thing.                            |
| `label:"good first issue" is:open` | Open items with this label.                                        |
| `login timeout`                    | Items with both words in the title, the repository, or the author. |
| `label:bug OR label:crash`         | Items with either label.                                           |
| `repo:acme/* -author:@me`          | Everything in the acme org that you did not open.                  |
| `about:"dependency bump"`          | Dependency updates, whoever opened them (smart decisions).         |
| `type:pr size:<50`                 | Small pull requests.                                               |

## In settings.json

Categories store the query as text: the `rule` of a [category](/docs/settings#categorygroups). Hush checks it when you save: a query with a part that it does not understand is refused, with the error.

```json settings
{
	"categoryGroups": [
		{
			"id": "org",
			"name": "Org",
			"categories": [
				{
					"id": "acme-prs",
					"name": "Acme PRs",
					"color": "blue",
					"rule": "repo:acme/* type:pr -author:bots",
					"description": ""
				}
			]
		}
	]
}
```
