---
title: Query language
description: The one-line syntax of Search, saved searches, and rules, with every word and value.
---

One short syntax finds items in [Search](/docs/search), defines [saved searches](/docs/search#saved-searches), and writes the queries of [rules](/docs/rules):

```query
repo:acme/* needs:review -author:bots label:"good first issue" login bug
```

## Syntax

- `word:value` is a condition. All conditions must match.
- `word:a,b` (or the same word twice) matches **any** of the values: `repo:acme/web,acme/api`.
- `*` matches anything, and `?` one character, in `repo:`, `author:`, and `from:`: `repo:acme/*`, `author:dependabot*`.
- Quote a value that has spaces or commas: `label:"good first issue"`.
- `author:bots` and `from:bots` mean any bot. `-author:bots` and `-from:bots` mean a person.
- `is:draft` and `-is:draft`; `is:open`, `is:closed`, `is:merged`. In searches also `is:done`, `is:snoozed`, and `is:muted`: what you did with the item.
- Other words must all be in the title, the repository, or the author. They are not case-sensitive.
- Only `-author:bots`, `-from:bots`, and `-is:draft` can have a `-`.

When a part has an error (an unknown word, a value that does not exist), Hush says so and leaves that part out. While you type, suggestions show the words and their values; ↑ and ↓ move, Enter or Tab picks one, and Esc closes the list.

## Words

{{ref:query}}

## `author:` and `from:`

- `author:` is who **opened** the PR or issue.
- `from:` is who did the **newest activity** on it: the newest comment or review. New commits count as activity too, but GitHub does not say who pushed them, so `from:` does not match them.

For example, `from:github-actions` finds the items where the newest thing is a comment by GitHub Actions.

## `in:` and `needs:`

- In Search and saved searches, `in:` is the item's lane now, after your rules and your choices (Not my turn, It is my turn).
- In rules, `in:` is where Hush put the item by itself, before your rules. So a rule can change part of Hush's placement: `repo:acme/big in:turn needs:reply`.
- `needs:` is what Hush thinks you must do: `review`, `fix-ci`, `reply`… `needs:nothing` is an item that needs nothing from you.

## Examples

| Query                              | Finds                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| `repo:acme/*`                      | Everything in the acme org.                                        |
| `needs:review -author:bots`        | Review requests from people.                                       |
| `type:pr is:open author:alice`     | Open PRs that Alice opened.                                        |
| `event:mentioned,team-mentioned`   | Items where you or your team were mentioned.                       |
| `needs:fix-ci repo:acme/web`       | Failing CI on your PRs in one repository.                          |
| `from:bots in:updates`             | Updates where a bot did the newest thing.                          |
| `in:waiting type:pr`               | PRs that wait on others.                                           |
| `is:snoozed`                       | Everything that you snoozed.                                       |
| `label:"good first issue" is:open` | Open items with this label.                                        |
| `type:release,discussion`          | Releases and discussions.                                          |
| `login timeout`                    | Items with both words in the title, the repository, or the author. |

## In settings.json

A query is stored as text: the `when` of a [rule](/docs/settings#rules), and the `query` of a [saved search](/docs/settings#saved). Hush checks it when you save; a query with an error is not saved.

```json settings
{ "rules": [{ "when": "repo:acme/* needs:review -author:bots", "then": { "push": true } }] }
```
