---
title: Rules
description: Put items in Your turn or Updates, mute them, turn pushes on or off, and snooze them by themselves.
---

Hush's own placement decides [what is your turn](/docs/your-turn#what-makes-it-your-turn). Rules change that for the items that you choose: a repository that is only an update for you, a bot to mute, a person whose replies you always want in Your turn.

**Most people need few rules.** [Not my turn](/docs/your-turn#not-my-turn) on an item makes the ones that matter for you, or fixes a setting.

## How rules work

- Hush places an item by itself first. Then it checks your rules **from top to bottom**. **The first rule that matches wins**; the rules below it do not count for that item.
- A rule is a **query** (when) and **what to do** (then). The query uses the same words as [Search](/docs/query-language). An empty query matches every item.
- When you save rules, Hush places your stored items again, so the lanes change at once.

A rule can do one or more of these:

| Then          | JSON                            | Does                                                                       |
| ------------- | ------------------------------- | -------------------------------------------------------------------------- |
| **Put it in** | `"lane": "turn"` or `"updates"` | Your turn or Updates.                                                      |
|               | `"mute": true`                  | Hides it from every lane. [Search](/docs/search) finds it under **Muted**. |
| **Push**      | `"push": true` or `false`       | In place of the [push setting](/docs/notifications#what-gets-pushed).      |
| **Snooze it** | `"snoozeHours"`: 1 to 720       | When it comes into Your turn, snoozes it for this many hours.              |

A rule cannot put an item in **Waiting**: Waiting is for items where someone else must act, and only the facts decide that.

**Snooze it** acts when the item comes into Your turn. If you move it back yourself, it stays.

## Make a rule

In **Settings → Advanced → Rules**:

- **New rule** adds an empty rule. **From a template** adds a finished example.
- Or right-click an item and choose **Make a rule…**: the new rule has that item's repository and type.

Each rule is a card. Give it a name (it shows on the items it places, as “rule: Docs repo is updates”), write its query, and choose what it does. Turn a rule off with its switch; move it with the arrows; duplicate or delete it from its “⋯” menu.

While you edit, each card shows how many of your stored items it catches, with examples, and the footer says what would change if you save: “If you save: 4 to Updates, 2 to Muted.” Nothing changes until you choose **Save rules**.

## Queries in rules

The words are the same as in [Search](/docs/query-language), with these differences:

- `in:` is where **Hush** put the item, before your rules: `in:turn` matches what Hush thinks is your turn.
- `needs:` is what Hush thinks you must do, before your rules.
- `is:done`, `is:snoozed`, and `is:muted` are only for searches: a rule decides where an item goes, not what you did with it.

| Query word                     | Matches                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `repo:acme/*`                  | The repository. `*` matches anything.                     |
| `author:dependabot*`           | Who opened the PR or issue.                               |
| `author:bots` / `-author:bots` | The author is a bot, or a person.                         |
| `from:alice`                   | Who did the newest activity: a comment or a review.       |
| `from:bots` / `-from:bots`     | The newest activity is by a bot, or by a person.          |
| `label:bug`                    | Has this label (the exact name, any case).                |
| `type:pr`                      | What it is: pr, issue, ci, release, discussion…           |
| `event:mentioned`              | Why GitHub notified you.                                  |
| `needs:review`                 | What Hush thinks you must do.                             |
| `in:updates`                   | Where Hush put it.                                        |
| `is:draft` / `-is:draft`       | A draft PR, or not.                                       |
| `is:open`                      | Open, closed, or merged.                                  |
| words                          | Each word is in the title, the repository, or the author. |

Every value is in the [query language](/docs/query-language) reference.

## Examples

Most rules are one line. As queries, with what they do:

| When                                     | Then                     |
| ---------------------------------------- | ------------------------ |
| `repo:acme/website`                      | Updates                  |
| `author:dependabot*`                     | Mute                     |
| `needs:review is:draft`                  | No push                  |
| `type:release repo:sveltejs/*`           | Your turn, push          |
| `type:ci repo:acme/nightly`              | Snooze 12 hours, no push |
| `repo:acme/monorepo in:turn needs:reply` | Updates                  |

The same rules in [settings.json](/docs/settings#rules):

```json settings
{
	"rules": [
		{ "name": "Website is updates", "when": "repo:acme/website", "then": { "lane": "updates" } },
		{ "name": "Mute dependabot", "when": "author:dependabot*", "then": { "mute": true } },
		{
			"name": "Quiet reviews on drafts",
			"when": "needs:review is:draft",
			"then": { "push": false }
		},
		{
			"name": "Svelte releases are my turn",
			"when": "type:release repo:sveltejs/*",
			"then": { "lane": "turn", "push": true }
		},
		{
			"name": "Nightly CI can wait",
			"when": "type:ci repo:acme/nightly",
			"then": { "snoozeHours": 12, "push": false }
		},
		{
			"name": "Monorepo chatter",
			"when": "repo:acme/monorepo in:turn needs:reply",
			"then": { "lane": "updates" }
		}
	]
}
```

## Tips

- Put narrow rules above wide ones. A wide rule at the top (such as `repo:acme/*`) catches everything below it.
- Use `in:` and `needs:` to change only part of Hush's placement: `repo:acme/monorepo needs:reply` changes replies there, and leaves your reviews in Your turn.
- A rule that sends a whole repository to Updates also sends your review requests there. To keep them, put a rule above it: `repo:acme/monorepo needs:review` with `"lane": "turn"`.
- A rule never writes to GitHub: an item muted by a rule stays muted only in Hush. **Mute** on an item unsubscribes you on GitHub too.
