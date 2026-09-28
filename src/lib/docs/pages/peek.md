---
title: Peek and GitHub actions
description: Read a pull request or issue without leaving Hush, and approve, comment, merge, or close it from there.
---

## Open the peek

The peek shows one pull request or issue next to your list. Click a row, or press {{key:list.peek}}. On a wide screen, the list stays visible and the peek follows the cursor as you move with {{key:list.next}} and {{key:list.prev}}. On a phone, the peek covers the list.

- {{key:list.peek}} or {{key:list.escape}} closes it.
- The peek stays open when you go to another lane, and shows the same item until you move the cursor there.
- The alert history (the bell) opens in the same place; the one that you opened last stays.

Only pull requests and issues have a peek. Other items (releases, workflow runs, alerts) open on GitHub.

## What it shows

- **Why it is here** and **what changed since you looked**, at the top: see [Why it is here](/docs/your-turn#why-it-is-here). With **Not my turn** or **It is my turn** next to it.
- The title and `repo#number`. Both link to GitHub.
- The state (open, draft, merged, closed), the author, and when it was opened.
- For a PR: the branches, the size, the reviews (who approved and who requested changes), the review requests, and a warning when it has merge conflicts.
- The checks: failed and running ones first. **Show all** lists every check.
- The labels and the assignees.
- The description, then the comments and reviews, oldest first. Inline review comments on the diff are counted, not shown.
- A comment box at the end.

An item that stays open in the peek for a moment is **seen**: its dot goes away, and the next “since you looked” starts from now. With [`markReadOnGitHub`](/docs/settings#markreadongithub) on, its notification is also marked read on GitHub.

## The bottom bar

The bar at the bottom of the peek has two parts:

1. The item's own buttons: **Done**, **Snooze**, and **Mute**, or **Move back** when it is done, snoozed, or muted.
2. The **actions on GitHub**: a main button, and **More** for the rest.

The main button is the action that fits what the item asks of you: **Approve** for a review, **Re-run failed jobs** when CI fails on your PR, **Merge** when it is ready, and **Comment** for a reply or anything else.

## Actions on GitHub

Hush shows only the actions that you can do now. An action that GitHub would refuse is in **More** with the reason, for example “GitHub does not let you review your own pull request” or “Required reviews or checks are missing”.

{{ref:actions}}

- **Approve** waits 5 seconds before Hush sends it, because GitHub cannot take back an approval. **Undo** in the message stops it. **Approve with a comment…** (in More) opens the comment box.
- **Request changes** and **Comment** need text: the comment box opens. {{key:editor.send}} sends it.
- **Merge** asks once more: the button becomes “Confirm: merge”. Press it (or the key) again. The merge uses the method chosen under **Merge method** in More, when the repository allows more than one. Hush merges only the commit that you saw: if someone pushed since, GitHub refuses, and you can look again.
- **Enable auto-merge** shows when the repository allows it and the PR cannot merge yet: GitHub merges it when the checks and reviews pass.
- **Close** and **Reopen** can be undone from the message.

After an action, Hush checks the item again at once, so the lists update without a sync.

The keys work while the peek is open. Change them in [Keybinds](/docs/keybinds) (the “Peek” group).

## The comment box

The box at the end of the conversation posts a comment. It can also approve or request changes with your text. {{key:editor.send}} sends. You can write Markdown, the same as on GitHub.
