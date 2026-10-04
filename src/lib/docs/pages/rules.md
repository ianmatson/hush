---
title: Rules
description: Send threads to Needs you, FYI, or Muted, turn pushes on or off, and move threads to Done or Snoozed by themselves.
---

Hush's defaults decide what [needs you](/docs/inbox#what-needs-you). Rules change that for the threads that you choose: a repository that is only FYI for you, a bot to mute, a person whose replies you always want pushed.

## How rules work

- Hush sorts a thread with its defaults first. Then it checks your rules **from top to bottom**. **The first rule that matches wins**; the rules below it do not count for that thread.
- A rule has **conditions** (when) and **effects** (then). All conditions must match. A condition with more than one value matches any of them.
- When you save rules, Hush sorts your stored threads again, so the lists change at once.

A rule can do one or more of these:

| Effect           | JSON                                                             | Does                                                                   |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Put it in a list | `"category": "action"`, `"fyi"`, or `"muted"`                    | Needs you, FYI, or Muted.                                              |
| Push or not      | `"push": true` or `false`                                        | In place of the [push settings](/docs/notifications#what-gets-pushed). |
| Move it          | `"triage": "done"`, or `"triage": "snooze"` with `"snoozeHours"` | To Done, or snoozed for 1 to 720 hours.                                |

**Move it** acts when the thread has new activity or when the rule starts to match. If you bring a thread back to the inbox yourself, it stays there until its next activity.

## Make a rule

In **Settings → Inbox → Rules**:

- **New rule** adds an empty rule. **From a template** adds a finished example.
- Or right-click a thread in the inbox and choose **Make a rule…**: the new rule has that thread's repository and type.

Each rule is a card. Give it a name (it shows on the threads it sorts, as “rule: Docs repo is FYI”), add conditions, and choose what it does. The conditions are a [query](/docs/query-language), such as `repo:acme/website type:pr`: write it as text, or pick the conditions one by one. The rule stores the text. Turn a rule off with its switch; move, duplicate, or delete it from its buttons.

While you edit, each card shows how many of your stored threads it would catch, and the footer says what would change if you save: “If you save: 4 to FYI, 2 to Muted.” Nothing changes until you choose **Save rules**.

## Conditions

A rule's conditions are one [query](/docs/query-language). All of its conditions must match.

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
| `needs:review`                 | What Hush thinks you must do, before your rules.          |
| `in:fyi`                       | Where Hush's defaults put it, before your rules.          |
| `is:draft` / `-is:draft`       | A draft PR, or not.                                       |
| `is:open`                      | Open, closed, or merged.                                  |
| words                          | Each word is in the title, the repository, or the author. |
| `about:"database migrations"`  | What it is about, in your words (smart decisions).        |

Every word and value is in the [query language](/docs/query-language) reference.

## Examples

Most rules are one line. As queries, with what they do:

| When                           | Then                     |
| ------------------------------ | ------------------------ |
| `repo:acme/website`            | FYI                      |
| `author:dependabot*`           | Muted                    |
| `needs:review is:draft`        | No push                  |
| `type:release repo:sveltejs/*` | Needs you, push          |
| `from:github-actions in:fyi`   | Done                     |
| `type:ci repo:acme/nightly`    | Snooze 12 hours, no push |

The same rules in [settings.json](/docs/settings#rules):

```json settings
{
	"rules": [
		{ "name": "Website is FYI", "when": "repo:acme/website", "then": { "category": "fyi" } },
		{ "name": "Mute dependabot", "when": "author:dependabot*", "then": { "category": "muted" } },
		{
			"name": "Quiet reviews on drafts",
			"when": "needs:review is:draft",
			"then": { "push": false }
		},
		{
			"name": "Svelte releases need me",
			"when": "type:release repo:sveltejs/*",
			"then": { "category": "action", "push": true }
		},
		{
			"name": "Bot comments are done",
			"when": "from:github-actions in:fyi",
			"then": { "triage": "done" }
		},
		{
			"name": "Nightly CI can wait",
			"when": "type:ci repo:acme/nightly",
			"then": { "triage": "snooze", "snoozeHours": 12, "push": false }
		}
	]
}
```

## Tips

- Put narrow rules above wide ones. A wide rule at the top (such as `repo:acme/*`) catches everything below it.
- Use `in:` and `needs:` to change only part of Hush's sorting: `repo:acme/big-monorepo in:fyi` changes nothing about what needs you there.
- To hear about something without seeing it in Needs you, use `"push": true` with `"category": "fyi"`.
- A rule never sends a thread to GitHub: Muted by a rule stays in Hush. **Mute** in the inbox unsubscribes you on GitHub too.
