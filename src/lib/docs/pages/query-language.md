---
title: Query language
description: The one-line syntax of view searches, category rules, and custom sections, with every word, where it works, and its values.
---

One syntax writes the searches of [views](/docs/views), the rules of [categories](/docs/categories#rules), and the rules of [custom sections](/docs/pull-requests-and-issues#custom-sections). The words mean the same thing in each place:

```query search
is:open review-requested:@me size:<50 updated:>@today-7d
```

Write a query as text, or build it one condition at a time. Both make the same query.

## Three kinds of words

- **GitHub and Hush** words, such as `repo:`, `author:`, `label:`, `review:`, and `updated:`. In a view's search, GitHub runs them. In a category rule or a section, Hush checks them on what it knows about the item.
- **GitHub only** words, such as `mentions:`, `involves:`, and `reviewed-by:`. They work only in a view's search, because Hush does not have these facts.
- **Hush only** words: `size:`, `from:`, `category:`, `about:`, `author:bots`, and wildcards such as `repo:acme/*`. GitHub does not know them, so Hush checks them.

The table in [Words](#words) says where each word works.

## In a view's search

Hush sends the GitHub words of a search to GitHub. Then it checks the Hush words on each result, and keeps the results that match:

```query search
repo:acme/web is:pr -author:bots size:<50
```

Here GitHub finds the pull requests in `acme/web`. Hush keeps the ones that people opened, with fewer than 50 changed lines.

- Hush checks the Hush words only on the 100 newest results of each search. Put the GitHub words that narrow the search the most first: a person, a team, a repository, or an organization.
- All the words of a search must match. For “this or that”, give the view more than one search.
- A search cannot use `OR`, parentheses, or `about:`. For `about:`, make a category whose rule uses it, then use `category:` in the search.
- A GitHub and Hush word takes one value in a search: `author:alice`, not `author:alice,bob`. `label:` is the exception: GitHub reads `label:bug,crash` as either label.
- Other words go to GitHub as you wrote them, so every [GitHub search word](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests) works.
- A search that reads a [project board](/docs/views#project-boards) goes to the board as you wrote it. It uses the board's filter words.

## In a category rule

Hush checks the whole rule on what it knows about each pull request or issue:

```query
repo:acme/* type:pr -author:bots (label:bug OR label:crash)
```

- `OR` (in capitals) matches when either side matches.
- Parentheses group conditions.
- `word:a,b` (or the same word twice) matches **any** of the values: `repo:acme/web,acme/api`.
- A rule cannot use GitHub only words, or `category:`: a rule cannot depend on another category.

## In a custom section

A section's rule works like a category rule, with `OR` and parentheses. It can also use `category:`, but not `about:` or the GitHub only words:

```query
status:failure OR (review:changes_requested -author:@me)
```

## Syntax

- `word:value` is a condition. All conditions must match.
- `-` in front of a condition means “not”: `-label:wontfix`. In a rule, also in front of a group: `-(label:a OR label:b)`.
- `@me` means you, wherever a login goes: `author:@me`, `assignee:@me`, `review-requested:@me`.
- `*` matches anything, and `?` one character: `repo:acme/*`, `author:dependabot*`. Only Hush reads wildcards.
- Quote a value that has spaces or commas: `label:"good first issue"`.
- `author:bots` and `from:bots` mean any bot. `-author:bots` and `-from:bots` mean a person.
- Free words: in a view's search, GitHub's text search. In a rule, every word must be in the title, the repository, or the author. They are not case-sensitive.

When a part has an error (an unknown word, a value that does not exist, a word that does not work in that place), Hush says so and does not save the query. While you type, suggestions show the words that work there, and their values; ↑ and ↓ move, Enter or Tab picks one, and Esc closes the list.

## Dates and numbers

- `created:` and `updated:` take a date: `updated:>2026-01-01`, `created:<=2026-01-31`, or a range, `updated:2026-01-01..2026-02-01`. `*` leaves one end open: `created:2026-01-01..*`.
- `@today` is today, and `@today-7d` or `@today-2w` is days or weeks before it: `updated:<@today-14d` is older than 14 days. Hush changes `@today` to a date before it sends a search to GitHub.
- Hush compares whole days, in UTC, like GitHub.
- `comments:` and `size:` take a number: `comments:>10`, `size:<50`, `size:10..200`, `comments:0`.

## Words

{{ref:query}}

## `author:` and `from:`

- `author:` is who **opened** the PR or issue.
- `from:` is who did the **newest activity** on it: the newest comment or review. New commits count as activity too, but GitHub does not say who pushed them, so `from:` does not match them.

For example, `from:github-actions` finds the items where the newest thing is a comment by GitHub Actions.

## `review:` and `status:`

- `review:none` is a pull request with no review yet. `review:required`, `review:approved`, and `review:changes_requested` follow the pull request's review decision.
- `status:` is the CI of a pull request: `success`, `failure`, or `pending`.
- Issues never match these words.

## `about:`

`about:` says in your own words what a PR or issue is about:

```query
about:"database migrations or schema changes"
```

It needs [smart decisions](/docs/settings#smartdecisions) on. Jev, a decision model, reads the title, labels, start of the description, and last 2 comments, and decides whether the item is about what you wrote. It matches only when Jev is sure.

- Use it only in the rules of [categories](/docs/categories#rules). Hush checks the condition when you save, and again when an item's text changes.
- Put exact words first where you can: in `repo:acme/api about:"migrations"`, Jev reads only the items of acme/api.
- Up to 30 different `about:` conditions in all your categories, each up to 200 characters.

## `category:`

`category:` matches an item's category, by its name or its id: `category:low` or `category:"Low effort"`. Use it in a view's search. There is no `tag:`: an item has one category from each group.

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
| `review:approved status:success`   | Approved pull requests whose CI passed.                            |
| `updated:<@today-14d`              | Items with no change for 14 days.                                  |
| `no:assignee is:issue`             | Issues that nobody is assigned to.                                 |

Searches for views:

| Search                                             | Finds                                                  |
| -------------------------------------------------- | ------------------------------------------------------ |
| `is:open review-requested:@me size:<50`            | Small pull requests that wait for your review.         |
| `is:open involves:@me category:low`                | Open items that involve you, in the category Low.      |
| `repo:acme/web is:pr -author:bots status:failure`  | Pull requests by people in acme/web whose CI failed.   |
| `org:acme is:issue no:assignee created:>@today-7d` | New issues in the acme org that nobody is assigned to. |

## In settings.json

Views store their searches as text, in `searches`. Categories store their rule as text: the `rule` of a [category](/docs/settings#categorygroups). Hush checks both when you save: a query with a part that it does not understand is refused, with the error.

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
