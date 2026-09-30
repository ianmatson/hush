---
title: Peek and GitHub actions
description: Read a pull request or issue without leaving Hush, and approve, comment, merge, or close it from there.
---

## Open the peek

The peek shows one pull request or issue next to your list. Click a row, or press {{key:list.peek}}. On a wide screen, the list stays visible and the peek follows the cursor as you move with {{key:list.next}} and {{key:list.prev}}. On a phone, the peek covers the list.

- {{key:list.peek}} or {{key:list.escape}} closes it.
- The peek stays open when you go to another tab, and shows the same item until you move the cursor there.
- The alert history (the bell) opens in the same place; the one that you opened last stays.

Every thread has a peek. Besides pull requests and issues:

| Thread               | The peek shows                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow run**     | The workflow, the branch, the commit, and the PR it ran for; each job with its result and time; the steps that failed; and the end of each failed job's log, up to its error. **Re-run failed jobs** runs them again. |
| **Release**          | The name, the tag, who published it and when, and the release notes.                                                                                                                                                  |
| **Commit**           | The message, the author, and the changed files.                                                                                                                                                                       |
| **Discussion**       | The question or post, its category, whether it is answered, and the last 10 comments.                                                                                                                                 |
| **Dependabot alert** | The open alerts of the repository, newest first: severity, package, and the version that fixes it. GitHub shows alerts only to tokens that may read them; if it refuses, the peek says so.                            |

Other kinds (an invitation, for example) show what GitHub sent, and a link to it.

## What it shows

- **Why it is here**, at the top, in plain words: “Needs you: CI failed on your PR. GitHub: your workflow run. Rule: CI is FYI.” on the inbox, and “Your turn: Review requested, for 2d. Found by: Review requested from you.” on the Pull requests and Issues tabs. “Hush moved it: ✓ You approved” when Hush moved it by itself. Under it, what changed since you last looked (see [Since you looked](/docs/inbox#since-you-looked)).
- The title and `repo#number`. Both link to GitHub.
- The state (open, draft, merged, closed), the author, and when it was opened.
- For a PR: the branches, the size, the reviews (who approved and who requested changes), the review requests, and a warning when it has merge conflicts.
- The checks: failed and running ones first. **Show all** lists every check.
- The labels and the assignees.
- The description, then the comments and reviews, oldest first. Inline review comments on the diff are counted, not shown.
- The reactions under the description and each comment, as on GitHub. Click one to add yours or to take it back; the smile button adds another. Discussions have them too.
- A comment box at the end.

A thread that stays open in the peek for a moment is marked as read, also on GitHub. Turn this off with [`peekMarksRead`](/docs/settings#peekmarksread).

## The bottom bar

The bar at the bottom of the peek has two parts:

1. The buttons of the page that you are on: **Done**, **Snooze**, **Mute**, and **Read** in the inbox; **Hide until it changes** and **Copy link** on the Pull requests and Issues tabs.
2. The **actions on GitHub**: a main button, and **More** for the rest.

The main button is the action that fits what the thread asks of you: **Approve** for a review, **Re-run failed jobs** when CI fails on your PR, and **Merge** when it is ready. To reply, use the comment box at the end of the conversation (there is no Comment button in the bar).

## Actions on GitHub

Hush shows only the actions that you can do now. An action that GitHub would refuse is in **More** with the reason, for example “GitHub does not let you review your own pull request” or “Required reviews or checks are missing”.

{{ref:actions}}

- **Approve** waits 5 seconds before Hush sends it, because GitHub cannot take back an approval. **Undo** in the message stops it. **Approve with a comment…** (in More) opens the comment box.
- **Request changes** and **Comment** ({{key:peek.comment}}, or the palette with {{key:palette}}) need text: the comment box opens. {{key:editor.send}} sends it.
- **Merge** asks once more: the button becomes “Confirm: merge”. Press it (or the key) again. The merge uses the method chosen under **Merge method** in More, when the repository allows more than one. Hush merges only the commit that you saw: if someone pushed since, GitHub refuses, and you can look again.
- **Enable auto-merge** shows when the repository allows it and the PR cannot merge yet: GitHub merges it when the checks and reviews pass.
- **Close** and **Reopen** can be undone from the message.

After an action, Hush checks the item again at once, so the lists update without a sync.

The keys work while the peek is open. Change them in [Keybinds](/docs/keybinds) (the “Peek” group).

## The comment box

The box at the end of the conversation posts a comment. It can also approve or request changes with your text. {{key:editor.send}} sends. You can write Markdown, the same as on GitHub.

Type **@** to mention someone: the people in the conversation come first, then the other people of the repo, then your organization's teams (**@org/team**). Type **#** for an issue or pull request of the repo: first the most recently updated, then the ones that match your number or title words. **owner/repo#** finds them in another repo. {{key:editor.suggestNext}} and {{key:editor.suggestPrev}} move in the list, {{key:editor.suggestPick}} puts the pick in the text, and {{key:editor.suggestClose}} closes the list.

GitHub.com makes its own list with private data, so the order can be a little different there. The people and items are the same.
