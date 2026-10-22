---
title: Peek and GitHub actions
description: Read a pull request or issue without leaving Hush, and approve, comment, merge, or close it from there.
---

## Open the peek

The peek shows one pull request or issue next to your list. Click a row, or press {{key:list.peek}}. To open the full page on a click, set **Settings → General → Row layout → Click opens** to **Full page**. On a wide screen, the peek is a panel on the right that grows with the screen, the list stays visible, and the peek follows the cursor as you move with {{key:list.next}} and {{key:list.prev}}. On a phone, the peek covers the list.

- {{key:list.peek}} or {{key:list.escape}} closes it.
- The peek stays open when you go to another view, and shows the same item until you move the cursor there. Settings does not show the peek.
- The alert history (the bell) opens in the same place; the one that you opened last stays. An alert about a pull request or issue opens it in a peek there.
- For a pull request in a [stack](/docs/pull-requests-and-issues#stacked-pull-requests), the peek lists the stack at the top. {{key:dash.stackDown}} and {{key:dash.stackUp}} move down and up the stack.

### Open the peek from a link

Add `?peek=` and a pull request or issue to the address of a view, and Hush opens with its peek: `https://app.hush-gh.com/v/mine?peek=PostHog/posthog/123`. The value can be `owner/repo/123`, `owner/repo#123` (write `#` as `%23` in an address), or a GitHub link to the pull request or issue. When the item is in the list of that page, the peek opens on its row, with the buttons of the page.

The address follows the peek: when you open the peek or move it to another item, the address changes to its `?peek=` link. Reload the page, or copy the address, and the peek opens on the same item. When you close the peek, the address loses its `?peek=`.

### Full page

The full page shows the same pull request or issue as the peek, in a wider column, with the actions on GitHub in a bar at the bottom. For an item in your views, the bar also has **Snooze**.

- Press {{key:list.fullPage}} on a row, choose the expand button at the top of the peek, or choose **Open full page** in the right-click menu or the palette.
- With **Click opens** set to **Full page** (in **Settings → General → Row layout**), a click on a row and Enter in {{key:palette}} open the full page. {{key:list.peek}} still opens the peek.
- {{key:list.escape}} or {{key:list.fullPage}} goes back to the list. If the peek was open when you left the list, it is still open on the same item there.
- The keys for an item work here too: {{key:list.copy}} copies its GitHub link, {{key:dash.snooze}} snoozes it until new activity (or wakes it up), {{key:dash.mute}} mutes or unmutes it, and {{key:dash.read}} marks it as read or unread. Snooze, mute, and unread work only for items in your views. {{key:palette}} has the same actions, and the other snooze times.
- {{key:list.help}} shows the keys of the full page.
- The address is the same as on GitHub: `https://app.hush-gh.com/PostHog/posthog/pull/123`. To open a GitHub link in Hush, change `github.com` to `app.hush-gh.com`.

#### Links in descriptions and comments

A link to a pull request or an issue in a description or a comment opens its full page in Hush, in the same tab. Cmd+click (Ctrl+click on Windows and Linux) opens it in a new tab.

- A link to a pull request's files (`…/pull/123/files` or `…/pull/123/changes`) opens the Files tab.
- A link to a file or a line in the diff opens the Files tab at that file, and marks the line. When the line is not in the diff, Hush goes to the file.
- A link to a review comment (`…/pull/123#discussion_r456` or `…/pull/123/files#r456`) opens the Files tab at its thread, and marks the thread.
- All other links, such as files on a branch, commits, repositories, people, and labels, open on GitHub in a new tab.

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

#### Review comments

The review comments on the diff show in the Files tab, under the line that they are about, as on GitHub. Comments on a whole file, outdated comments (on lines that changed since), and comments on lines that are not in the diff show at the top of their file. A file's header and its row in the tree show how many of its threads are open.

- Resolved threads start closed. Click a thread's title to open or close it.
- **Reply** answers in the thread ({{key:editor.send}} sends). **Resolve** and **Unresolve** change the thread on GitHub.
- A thread shows up to 50 comments. **More on GitHub** links to the rest.
- The comments show only with **All changes**, not with **Since your review**: their line numbers belong to the whole diff.

#### Write review comments

Comment on the diff in the Files tab, as on GitHub:

1. Click a line number. To comment on several lines, drag over the line numbers, or Shift+click the last line. The lines must be in one hunk.
2. Write in the box that opens under the lines. {{key:editor.send}} adds the comment to your review, and Escape closes the box. Hush keeps what you wrote in this browser until you send it.
3. **Suggest a change** (on new lines only) adds a ` ```suggestion ` block with the selected lines. Change the lines in the block, and Hush shows the change under the box. The author can apply it on GitHub with one click.

**Start a review** (or **Add to review**) keeps the comment in your pending review: only you can see it. A bar at the top of the Files tab counts your pending comments:

- **Submit review** sends them all, with an optional summary, as **Comment**, **Approve**, or **Request changes** (which needs a summary). You cannot approve or request changes on your own pull request.
- **Discard** (press it twice) deletes the pending review and its comments.

A review that you started on GitHub shows here too, and the other way round. **Comment now** posts one comment at once, without a review; it is not available while you have a pending review, as on GitHub. **Edit** and **Delete** (press it twice) work on your own comments, pending or posted.

You can comment only with **All changes**: under **Since your review**, the line numbers are those of a different diff.

#### Viewed files

Check **Viewed** on a file, or press {{key:page.viewFile}}, when you are done with it. The file folds, and its row in the tree gets a check. This is GitHub's own **Viewed** mark, so GitHub shows it too, and the other way round. The count at the top tells how many files you viewed. When a file changes after you viewed it, GitHub takes the mark off, and Hush shows **Changed since you viewed it**.

#### Since your review

After you review a pull request, **Since your review** at the top of the Files tab shows only what changed after your review:

- When the new commits have no merge, Hush shows all their changes together.
- When the branch merged its base branch after your review, the combined changes would also show other people's work from the base branch. So Hush shows the new commits one at a time, with a **Commit** list, and leaves out the merge commits. When the only new commits are merges, Hush says so: there is nothing new to review.
- When the commit that you reviewed is not in the branch any more (for example, after a force push), Hush says so and shows all the changes.

The address of this view ends in `?since=review`.

## What it shows

- **Why it is here**, at the top, in plain words: the item's section and its reason, such as “Reviews: Review requested, for 2d.” Under it, what changed since you last looked (see [Since you looked](/docs/pull-requests-and-issues#since-you-looked)).
- The title and `repo#number`. Both link to GitHub.
- The state (open, draft, merged, closed), the author, and when it was opened. An **External** badge shows when the author is not a member or collaborator of the repository, and **First-time** when it is their first PR or issue there. The **External contributor** part in **Settings → General → Row contents** turns the badge on or off, for rows and the peek.
- For a PR: the size (click it to open the Files tab of the full page), the branches, the reviews (who approved and who requested changes), the review requests, and a warning when it has merge conflicts.
- For a PR: **Files**, the changed files with their added and deleted lines. The part starts closed. Click a file to see its changes in the Files tab of the full page.
- The checks: the part starts closed and shows how many failed, run, passed, and were skipped. Click **Checks** to open it: failed and running ones first. **Show all** lists every check.
- **Assignees**: a chip in the first row with the first assignee and “+2” for the others. Click it to see all of them. The labels are in one row under the author; when they do not fit, “+6 more” shows the rest. When you can triage in the repository (the Triage, Write, Maintain, or Admin role), the same chips change them on GitHub: search, then choose a person or a label to add it, or a checked one to remove it. **Assign** and the tag button add the first ones. A pull request or issue can have up to 10 assignees. GitHub does not assign people who cannot be assigned in the repository.
- **Project status**: a chip for each GitHub project that has the item, with its Status (“This week”). Click the chip to see the project. There you can change the status, move the item to another project of the same owner, or remove it from the project. A move or a removal loses the item's other fields on that project. The chips need the `project` scope (see [project boards](/docs/github-access#project-boards)).
- The description, then the comments and reviews, oldest first. Under each review are the threads that it started on the diff, as on GitHub: the file, the lines that the thread is about, and the comments with their replies. **Reply**, **Resolve**, and **Unresolve** work here too, and resolved threads start closed. Click the file to see the thread in the Files tab of the [full page](#the-files-tab).
- The checkboxes of task lists in the description and in comments. When GitHub lets you change the text (you wrote it, or you can write to the repository), click a checkbox to check or uncheck it on GitHub. If the text changed on GitHub since the peek loaded it, Hush loads it again and does not save. If Hush cannot find the checkbox in the Markdown, change it on GitHub.
- The reactions under the description and each comment, as on GitHub. Click one to add yours or to take it back; the smile button adds another.
- **Mentioned in Slack**: the Slack icon at the right of the first row, with the number of messages in the PostHog Slack that link to the PR or issue. “20+” means that there are more messages to load. Click the icon to see the messages, newest first, with the channel, the author, and the time. Scroll down to load more. Click a message to open it in the Slack app. Only for members of the PostHog GitHub org: turn it on in **Settings → Notifications → Slack → Show Slack mentions**. Hush searches Slack each time you open the peek and does not keep the results. The icon shows when the search is done, and only when there are messages.
- A comment box at the end.

When the peek opens an item, Hush marks it as read. This stays in Hush: it does not change your notifications on GitHub. Press {{key:dash.read}} to make the item unread again. See [Unread](/docs/pull-requests-and-issues#unread).

## The bottom bar

The bar at the bottom of the peek has two parts:

1. The buttons of the view: **Snooze** and **Copy link**.
2. The **actions on GitHub**: a main button, and **More** for the rest. On the full page, More is the **…** button at the right end of the bar.

The main button is the action that fits what the item asks of you: **Approve** for a review, **Re-run failed jobs** when CI fails on your PR, and **Merge** when it is ready. To reply, use the comment box at the end of the conversation (there is no Comment button in the bar).

## Actions on GitHub

Hush shows only the actions that you can do now. An action that GitHub would refuse is in **More** with the reason, for example “GitHub does not let you review your own pull request” or “Required reviews or checks are missing”.

{{ref:actions}}

- **Approve** sends at once. **Approve with a comment…** (in More) opens the comment box.
- **Request changes** and **Comment** ({{key:peek.comment}}, or the palette with {{key:palette}}) need text: the comment box opens. On the Files tab of the full page, Hush goes to the Conversation tab first. {{key:editor.send}} sends it.
- **Merge** has the name of the method that it uses, such as **Squash and merge**. From the main button, the key, or the palette, it opens a dialog: you can change the method there, then choose the merge button or press Enter. In More, it merges at once (a PR in a stack opens the dialog, to show what else happens). Change the method in More → **Merge method**. Hush remembers the method on this device; a repository that does not allow it uses the first method that it allows. Hush merges only the commit that you saw: if someone pushed since, GitHub refuses, and you can look again.
- While an action runs, a message says so (for example “Merging…”). When the action is done, the message tells the result.
- **Enable auto-merge** shows when the repository allows it and the PR cannot merge yet: GitHub merges it when the checks and reviews pass.
- **Ready for review** shows on a draft PR, and **Convert to draft** on an open PR, when you can edit the PR ({{key:peek.draftReady}}). On a draft with nothing else to do, **Ready for review** is the main button.
- **Close**, **Reopen**, **Enable auto-merge**, **Ready for review**, and **Convert to draft** can be undone from the message.

After an action, Hush checks the item again at once, so the lists update without a sync.

The keys work while the peek is open, and on the full page. Change them in [Keybinds](/docs/keybinds) (the “Peek” group).

## The comment box

The box at the end of the conversation posts a comment. It can also approve or request changes with your text. {{key:editor.send}} sends. You can write Markdown, the same as on GitHub.

Type **@** to mention someone: the people in the conversation come first, then the other people of the repo, then your organization's teams (**@org/team**). Type **#** for an issue or pull request of the repo: first the most recently updated, then the ones that match your number or title words. **owner/repo#** finds them in another repo. Type **:** and two letters for an emoji, as in Slack (**:ta** finds 🎉); a full shortcode such as **:tada:** becomes its emoji. {{key:editor.suggestNext}} and {{key:editor.suggestPrev}} move in the list, {{key:editor.suggestPick}} puts the pick in the text, and {{key:editor.suggestClose}} closes the list.

GitHub.com makes its own list with private data, so the order can be a little different there. The people and items are the same.

### Edit your comments

Choose **Edit** beside one of your comments or review messages in the conversation. Change the Markdown, then choose **Save** or press {{key:editor.send}}. **Cancel** or Escape closes the editor without saving. If a save fails, your text stays in the editor so you can try again. Hush shows **Edit** only for your own comments that GitHub lets you update.

### Images and videos

To attach an image or a video, paste it, drop it on the box, or click the paperclip. This works in every comment box: the conversation, line comments, replies, and the review summary. Hush uploads the file to GitHub, as GitHub.com does, so a file in a private repository stays private. The box shows **Uploading…** until the file is on GitHub, and you cannot send until then.

- GitHub accepts PNG, JPEG, GIF, WebP, SVG, MP4, MOV, and WebM files.
- An image or a GIF can be 10 MB. A video can be 10 MB on a free GitHub plan, and 100 MB on a paid plan.
- GitHub lets you attach files only in repositories that you can push to. Where you cannot, the paperclip does not show.
- An upload cannot be undone: if you delete the link from your comment, the file stays on GitHub.

Hush keeps what you type in the box in this browser until you send it, one draft for each pull request or issue. You can close the peek, or reload Hush, and come back to it. Drafts older than 30 days go away, and signing out deletes them all.
