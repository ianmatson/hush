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
- `*` matches anything, and `?` one character, in `repo:`, `author:`, and `from:`: `repo:acme/*`, `author:dependabot*`.
- Quote a value that has spaces or commas: `label:"good first issue"`.
- `author:bots` and `from:bots` mean any bot. `-author:bots` and `-from:bots` mean a person.
- `is:draft` and `-is:draft`; `is:open`, `is:closed`, `is:merged`.
- Other words must all be in the title, the repository, or the author. They are not case-sensitive.
- Only `-author:bots`, `-from:bots`, and `-is:draft` can have a `-`.

When a part has an error (an unknown word, a value that does not exist), Hush says so and leaves that part out. While you type, suggestions show the words and their values; ↑ and ↓ move, Enter or Tab picks one, and Esc closes the list.

## Words

{{ref:query}}

## `author:` and `from:`

- `author:` is who **opened** the PR or issue.
- `from:` is who did the **newest activity** on it: the newest comment or review. New commits count as activity too, but GitHub does not say who pushed them, so `from:` does not match them.

For example, `from:github-actions` finds the threads where the newest thing is a comment by GitHub Actions.

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

## In JSON

A query is stored as a JSON object of conditions: the `when` of a rule or a view. Each word is one key; the tables above show the key and the stored values. `repo:acme/* needs:review -author:bots is:draft login` is:

```json
{ "repo": "acme/*", "kind": ["review"], "bot": false, "draft": true, "text": "login" }
```

`repo`, `author`, and `from` (`by`) are text when they have one value, and lists when they have more. The other words are always lists.
