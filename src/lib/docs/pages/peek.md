---
title: Peek and GitHub actions
description: Read a pull request or issue without leaving Hush, and approve, comment, merge, or close it from there.
---

## Open the peek

The peek shows one pull request or issue next to your list. Click a row, or press {{key:list.peek}}. On a wide screen, the peek is a panel on the right that grows with the screen, the list stays visible, and the peek follows the cursor as you move with {{key:list.next}} and {{key:list.prev}}. On a phone, the peek covers the list.

- {{key:list.peek}} or {{key:list.escape}} closes it.
- The peek stays open when you go to the Inbox, Pull requests, or Issues tab, and shows the same item until you move the cursor there. Settings does not show the peek.
- The alert history (the bell) opens in the same place; the one that you opened last stays.
- For a pull request in a [stack](/docs/pull-requests-and-issues#stacked-pull-requests), the peek lists the stack at the top. {{key:dash.stackDown}} and {{key:dash.stackUp}} move down and up the stack.

Every inbox thread is about a pull request or an issue, so every thread has a peek.

### Open the peek from a link

Add `?peek=` and a pull request or issue to the address of the Inbox, Pull requests, or Issues tab, and Hush opens with its peek: `https://app.hush-gh.com/inbox?peek=PostHog/posthog/123`. The value can be `owner/repo/123`, `owner/repo#123` (write `#` as `%23` in an address), or a GitHub link to the pull request or issue. When the item is in the list of that tab, the peek opens on its row, with the buttons of the page.

The address follows the peek: when you open the peek or move it to another item, the address changes to its `?peek=` link. Reload the page, or copy the address, and the peek opens on the same item. When you close the peek, the address loses its `?peek=`.

### Full page

The full page shows the same pull request or issue as the peek, in a wider column, with the actions on GitHub in a bar at the bottom.

- Press {{key:list.fullPage}} on a row, choose the expand button at the top of the peek, or choose **Open full page** in the right-click menu or the palette.
- {{key:list.escape}} or {{key:list.fullPage}} goes back to the list. The peek is still open on the same item there.
- The address is the same as on GitHub: `https://app.hush-gh.com/PostHog/posthog/pull/123`. To open a GitHub link in Hush, change `github.com` to `app.hush-gh.com`.

A pull request has two tabs: **Conversation** ({{key:page.conversation}}) and **Files** ({{key:page.files}}). The Files tab has the address of GitHub's Files tab: `…/pull/123/files`.

### The Files tab

The Files tab shows the changes of the pull request, file by file, as on GitHub.

- On a wide screen, the files are in a tree on the left, with their folders. Click a folder to fold it, and click a file to go to its changes.
- Each file shows its changed lines, with the old and the new line numbers. Added lines are green, deleted lines are red.
- The code has syntax colors for the common languages, in the colors of your theme.
- On a wide screen, **Unified** and **Split** (or {{key:page.splitView}}) choose the layout. **Split** shows the old file on the left and the new file on the right. Hush remembers your choice. Narrow screens always show **Unified**.
- {{key:page.nextFile}} and {{key:page.prevFile}} go to the next and the previous file. {{key:page.foldFile}} folds or unfolds the file. **Fold all** and **Unfold all** do this for every file.
- Lock files, minified files, deleted files, and files with more than 400 changed lines start folded. Choose **Show the diff** to see them.
- GitHub shows no diff for binary files and very large files. Open them on GitHub with the link in their header.
- GitHub lists up to 3,000 files of a pull request.

#### Viewed files

Check **Viewed** on a file, or press {{key:page.viewFile}}, when you are done with it. The file folds, and its row in the tree gets a check. This is GitHub's own **Viewed** mark, so GitHub shows it too, and the other way round. The count at the top tells how many files you viewed. When a file changes after you viewed it, GitHub takes the mark off, and Hush shows **Changed since you viewed it**.

#### Since your review

After you review a pull request, **Since your review** at the top of the Files tab shows only what changed after your review:

- When the new commits have no merge, Hush shows all their changes together.
- When the branch merged its base branch after your review, the combined changes would also show other people's work from the base branch. So Hush shows the new commits one at a time, with a **Commit** list, and leaves out the merge commits. When the only new commits are merges, Hush says so: there is nothing new to review.
- When the commit that you reviewed is not in the branch any more (for example, after a force push), Hush says so and shows all the changes.

The address of this view ends in `?since=review`.

## What it shows

- **Why it is here**, at the top, in plain words: “Needs you: CI failed on your PR. GitHub: You opened this. Category: Bugs.” on the inbox, and “Your turn: Review requested, for 2d. Found by: Review requests.” on the Pull requests and Issues tabs. “Hush moved it: ✓ You approved” when Hush moved it by itself. Under it, what changed since you last looked (see [Since you looked](/docs/inbox#since-you-looked)).
- The title and `repo#number`. Both link to GitHub.
- The state (open, draft, merged, closed), the author, and when it was opened. An **External** badge shows when the author is not a member or collaborator of the repository, and **First-time** when it is their first PR or issue there. The **External contributor** part in **Settings → General → Row contents** turns the badge on or off, for rows and the peek.
- For a PR: the branches, the size, the reviews (who approved and who requested changes), the review requests, and a warning when it has merge conflicts.
- For a PR: **Files**, the changed files with their added and deleted lines. The part starts closed. Click a file to see its changes in the Files tab of the full page.
- The checks: failed and running ones first. **Show all** lists every check.
- The labels and the assignees.
- **Project status**: a chip for each GitHub project that has the item, with its Status (“This week”). Click the chip to see the project. There you can change the status, move the item to another project of the same owner, or remove it from the project. A move or a removal loses the item's other fields on that project. The chips need the `project` scope (see [project boards](/docs/github-access#project-boards)).
- The description, then the comments and reviews, oldest first. Inline review comments on the diff are counted, not shown.
- The reactions under the description and each comment, as on GitHub. Click one to add yours or to take it back; the smile button adds another.
- **Mentioned in Slack**: messages in the PostHog Slack that link to the PR or issue, newest first, with the channel, the author, the time, and a link to the message. Only for members of the PostHog GitHub org: turn it on in **Settings → Notifications → Slack → Mentions in the peek**. Hush searches Slack each time you open the peek and does not keep the results. The part starts closed: its title shows the number of messages, or a spinner while Hush searches. Click the title to show the messages. With no messages, this part is not shown.
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

- **Approve** sends at once. **Approve with a comment…** (in More) opens the comment box.
- **Request changes** and **Comment** ({{key:peek.comment}}, or the palette with {{key:palette}}) need text: the comment box opens. {{key:editor.send}} sends it.
- **Merge** asks once more: the button becomes “Confirm: merge”. Press it (or the key) again. The merge uses the method chosen under **Merge method** in More, when the repository allows more than one. Hush merges only the commit that you saw: if someone pushed since, GitHub refuses, and you can look again.
- **Enable auto-merge** shows when the repository allows it and the PR cannot merge yet: GitHub merges it when the checks and reviews pass.
- **Ready for review** shows on a draft PR, and **Convert to draft** on an open PR, when you can edit the PR ({{key:peek.draftReady}}). On a draft with nothing else to do, **Ready for review** is the main button.
- **Close**, **Reopen**, **Enable auto-merge**, **Ready for review**, and **Convert to draft** can be undone from the message.

After an action, Hush checks the item again at once, so the lists update without a sync.

The keys work while the peek is open. Change them in [Keybinds](/docs/keybinds) (the “Peek” group).

## The comment box

The box at the end of the conversation posts a comment. It can also approve or request changes with your text. {{key:editor.send}} sends. You can write Markdown, the same as on GitHub.

Type **@** to mention someone: the people in the conversation come first, then the other people of the repo, then your organization's teams (**@org/team**). Type **#** for an issue or pull request of the repo: first the most recently updated, then the ones that match your number or title words. **owner/repo#** finds them in another repo. Type **:** and two letters for an emoji, as in Slack (**:ta** finds 🎉); a full shortcode such as **:tada:** becomes its emoji. {{key:editor.suggestNext}} and {{key:editor.suggestPrev}} move in the list, {{key:editor.suggestPick}} puts the pick in the text, and {{key:editor.suggestClose}} closes the list.

GitHub.com makes its own list with private data, so the order can be a little different there. The people and items are the same.

Hush keeps what you type in the box in this browser until you send it, one draft for each pull request or issue. You can close the peek, or reload Hush, and come back to it. Drafts older than 30 days go away, and signing out deletes them all.
