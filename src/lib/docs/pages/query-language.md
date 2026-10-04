---
title: Query language
description: The one-line syntax of the filter box, saved views, and rules, with every word and value.
---

One short syntax filters the inbox, defines [saved views](/docs/views), and writes the conditions of [rules](/docs/rules):

```query
repo:acme/* needs:review -author:bots label:"good first issue" login bug
```

## Syntax

- `word:value` is a condition. All conditions must match.
- `word:a,b` (or the same word twice) matches **any** of the values: `repo:acme/web,acme/api`.
- `OR` (in capitals) matches when either side matches: `label:bug OR label:crash`.
- Parentheses group conditions: `repo:acme/web (label:bug OR author:alice)`.
- `-` in front of any condition, word, or group means "not": `-label:wontfix`, `-(label:a OR label:b)`.
- `@me` means you, wherever a login goes: `author:@me`, `assignee:@me`, `review-requested:@me`.
- `*` matches anything, and `?` one character, in `repo:`, `author:`, and `from:`: `repo:acme/*`, `author:dependabot*`.
- Quote a value that has spaces or commas: `label:"good first issue"`.
- `author:bots` and `from:bots` mean any bot. `-author:bots` and `-from:bots` mean a person.
- `is:draft` and `-is:draft`; `is:open`, `is:closed`, `is:merged`.
- Other words must all be in the title, the repository, or the author. They are not case-sensitive.

When a part has an error (an unknown word, a value that does not exist), Hush says so and leaves that part out. While you type, suggestions show the words and their values; ↑ and ↓ move, Enter or Tab picks one, and Esc closes the list.

## Words

{{ref:query}}

## `author:` and `from:`

- `author:` is who **opened** the PR or issue.
- `from:` is who did the **newest activity** on it: the newest comment or review. New commits count as activity too, but GitHub does not say who pushed them, so `from:` does not match them.

For example, `from:github-actions` finds the threads where the newest thing is a comment by GitHub Actions.

## `about:`

`about:` says in your own words what a PR or issue is about:

```query
about:"database migrations or schema changes"
```

It needs [smart decisions](/docs/settings#smartdecisions) on. Jev, a decision model, reads the title, labels, start of the description, and last 2 comments, and decides whether the item is about what you wrote. It matches only when Jev is sure.

- Use it in [rules](/docs/rules) and [saved views](/docs/views). Hush checks the condition when you save, and again when an item's text changes. In the filter box, `about:` finds only what a saved rule or view with the same words already checked.
- Put exact words first where you can: in `repo:acme/api about:"migrations"`, Jev reads only the items of acme/api.
- Up to 10 different `about:` conditions in all your rules and views, each up to 200 characters.

## Examples

| Query                              | Finds                                                                |
| ---------------------------------- | -------------------------------------------------------------------- |
| `repo:acme/*`                      | Everything in the acme org.                                          |
| `needs:review -author:bots`        | Review requests from people.                                         |
| `type:pr is:open author:alice`     | Open PRs that Alice opened.                                          |
| `event:mentioned,team-mentioned`   | Threads where you or your team were mentioned.                       |
| `needs:fix-ci repo:acme/web`       | Failing CI on your PRs in one repository.                            |
| `from:bots in:fyi`                 | FYI threads where a bot did the newest thing.                        |
| `label:"good first issue" is:open` | Open threads with this label.                                        |
| `type:release,discussion`          | Releases and discussions.                                            |
| `login timeout`                    | Threads with both words in the title, the repository, or the author. |
| `review-requested:@me size:<50`    | Small pull requests that wait for your review.                       |
| `label:bug OR label:crash`         | Threads with either label.                                           |
| `repo:acme/* -author:@me`          | Everything in the acme org that you did not open.                    |
| `about:"dependency bump"`          | Dependency updates, whoever opened them (smart decisions).           |

## In settings.json

Rules and saved views store the query as text: the `when` of a [rule](/docs/settings#rules) and the `query` of a [view](/docs/settings#views). Hush checks it when you save: a query with a part that it does not understand is refused, with the error.

```json settings
{ "rules": [{ "when": "repo:acme/* needs:review -author:bots", "then": { "push": true } }] }
```
