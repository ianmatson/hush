---
title: Pull requests and issues
description: The list in each view, and how Group by puts it into sections.
---

Each [view](/docs/views) lists its open pull requests and issues, also when GitHub sent no notification about them. A switch at the top shows **Pull requests**, **Issues**, or **Both** (when the view finds both types). {{key:dash.kind}} changes it, and this browser remembers the choice for each view. Each item has its [categories](#categories).

## Group by

The **Group by** button, at the top right, puts the list into sections. Each view keeps its own choice (the [`groupBy`](/docs/settings#views) of the view): **Mine** starts with **Your role**, and a new view with **Status**.

| Group by                          | Sections                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **None**                          | One list, with no sections.                                                                                                                            |
| **Your role**                     | **You opened**, **Reviews** (your review or your team's review is requested, or you reviewed it), **Assigned to you**, **Involved** (everything else). |
| **Status**                        | Pull requests: **No review yet**, **In review**, **Changes requested**, **Approved**, **Drafts**. Issues: **Unassigned**, **Assigned**.                |
| **Repository**, **Author**        | One section for each repository, or each author, in name order.                                                                                        |
| **Label**, **Assignee**           | One section for each set of labels, or of assignees, such as “bug, docs”. An item with none is in **No labels** or **No assignee**.                    |
| A category group, such as Effort  | One section for each category, then **Not sorted** for the items that have no category from the group. See [Categories](/docs/categories).             |
| A project, such as Website status | One section for each Status of the project, in the board's order, then **No status**, then **Not in project**. See [Project status](#project-status).  |
| **Custom sections**               | The sections that you made for this view, then **Everything else**. See [Custom sections](#custom-sections).                                           |

An item is in exactly one section. Sections with no items do not show. Choose the name of a section to close it or open it; **Drafts** is closed at first. This browser remembers your choice for each view and each Group by.

With **Both**, Status shows the pull request sections first, then the issue sections.

{{key:palette}} finds the Group by choices too: type “group by”.

### Custom sections

A view can have its own sections. Each one is a name and a rule in the [query language](/docs/query-language), such as `status:failure` or `size:<50 OR category:effort/low`:

```query
review-requested:@me review:none
```

- An item goes into the **first** section whose rule matches, top to bottom. **Everything else** holds the rest, and is always last.
- Make them on the view's card in **Settings → Views**: set **Group by** to **Custom sections**, then add sections. **Edit custom sections…** at the end of the Group by menu goes there.
- A view has up to 10 sections. Each name is unique, up to 40 characters.
- A rule can use every word that Hush checks, such as `review:`, `status:`, `size:`, `updated:`, `from:`, and `category:`. It cannot use `about:`: make a category whose rule uses `about:`, then use `category:`. Words that only GitHub has, such as `mentions:`, do not work here.
- The view keeps its sections when you choose another Group by.

### Project status

Group by lists each open GitHub project that holds an item of the view, with the most items first. Hush reads the project's **Status** field: its options are the sections, with the color of each option.

- An item that is in the project with no Status is in **No status**.
- An item that is not in the project is in **Not in project**.
- To change an item's Status, open it in the [peek](/docs/peek). The list moves it when Hush reads the project again.
- Hush needs project access: sign in with GitHub again if Group by says **Project status needs project access**. A custom token needs the `read:project` scope (`project` to change a Status).

## Order and reasons

Inside a section, the items that need you come first, the most urgent first (failing CI before a comment), then the ones that waited longest. Each row says what is going on, in a few words:

- **Pull requests:** CI failing · Changes requested · Merge conflict · 2 open threads · Ready to merge · @alice commented · Review requested · Re-review requested · Assigned to you · New commits since your review · Review for acme/web · CI running · Waiting for review · Waiting on author · You approved · Draft · Bot PR.
- **Issues:** Assigned to you · @alice replied · Waiting for replies · No replies yet · Waiting for a reply.

### Whose turn it is

Hush decides whose turn it is from the facts of each item: CI, reviews, review requests, conflicts, and comments. It is **your turn** when one of these is true.

**Your pull requests** (not drafts):

- CI fails.
- Someone requested changes.
- It has merge conflicts.
- It is approved, but review threads are still open.
- It is approved and CI is not running: it is ready to merge.
- A person commented after your newest push.

**Other people's pull requests:**

- Your review is requested from you by name, also again after your review.
- It is assigned to you.
- New commits arrived since your review.

**Issues:** it is assigned to you, or a person replied on an issue that is assigned to you or that you opened.

A review request to one of your teams is **your team's turn**: the row says “Review for acme/web”. Other items wait on someone else (“Waiting for review”, “You approved”), or on nobody (“Draft”, “Bot PR”).

- **Bots:** a pull request that a bot opened is not your turn, unless it asks for your review by name. A comment by a bot is not a reply.
- **Review requests** end only when GitHub no longer asks you. A review by someone else does not end your request.
- **Smart decisions:** with [smart decisions](/docs/settings#smartdecisions) on (the default), Jev reads the newest comments. When they need nothing from you (thanks, approval, a status update, +1), they are not your turn. The row then says “no reply needed”.
- [Categories](/docs/categories) do not change whose turn it is.

### Since you looked

A row also lists what changed since you last looked at the item: “+2 commits”, “CI fails”, “@alice approved”, “3 new comments”. Hush remembers what the item looked like when you opened it in the peek or on its full page, or opened it on GitHub from Hush. The row and the peek list:

- New commits, new comments, and new reviews (“@alice approved”, “@bob requested changes”).
- CI: “CI fails”, “CI passes now”, “CI running”.
- Your review requested again; merged, closed, or reopened; ready for review or back to draft; new labels.

Before your first look, nothing is listed. Your own changes do not count. To hide this list on rows, turn off **Changes since you looked** in **Settings → General → Row contents**.

### Stale

An item that has waited on you or on others for more than 3 days is **stale**: it says how long it waited (“waiting 5d”) in amber. Change the number of days with [`dash.staleDays`](/docs/settings#dash-staledays).

## Stacked pull requests

A pull request is on top of another one when its base branch is the head branch of the other one. Hush shows a stack as one row, in the place of its most urgent pull request. Stacks from `gh stack`, Graphite, and branches that you made yourself are all the same to Hush.

- The row is in the section of the stack's most urgent pull request, and shows that pull request first. “2 of 4” is its place in the stack, from the base branch up. Click the row to peek it.
- The [peek](/docs/peek) lists the whole stack at the top. {{key:dash.stackDown}} and {{key:dash.stackUp}} move down and up the stack, and the row in the list turns to show the same pull request as the peek.
- A pull request that is in the stack but not in this view shows as “Not in this list”. You can peek it, but it has no actions in the list.

Hush finds up to 3 open pull requests under each pull request in your list, in the same repository.

## Categories

An item has one [category](/docs/categories) from each category group, or none when it is **Not sorted** there. Their icons show on each row; to show their names too, turn on **Category names** in **Settings → General → Row contents**. The category button, next to **Refresh from GitHub**, lists every group and its categories, with counts: choose one to see only its items, **Not sorted** to see the items with no category from that group, and **Every category** to see all.

To change an item's category, right-click it, choose the name of a group, such as **Effort**, and choose a category. **Choose automatically** removes your choice for that group. This works on a selection too.

Set up category groups, and how Hush places items, in **Settings → Categories**. See [Categories](/docs/categories).

## External contributors

An item opened by someone who is not a member or collaborator of the repository has an **External** badge. It shows **First-time** when it is their first pull request or issue there. Bots get no badge. To turn the badge off, go to **Settings → General → Row contents** and turn off **External contributor**; the [peek](/docs/peek) follows the same setting.

## Find an item

A view has no filter box: its searches decide what is in it. To find a pull request or issue, use search: press {{key:palette}} or {{key:list.search}}, and type words from its title, its repository, or its number. To show different items, [edit the view](/docs/views#change-or-delete-a-view), or add another view.

## Actions

| Action                       | Key                         | What it does                                                                       |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Peek                         | {{key:list.peek}}           | Read it in the [peek](/docs/peek), and act on GitHub from there.                   |
| Main action                  | {{key:list.open}}           | Review, Fix CI, Reply… on GitHub.                                                  |
| Open on GitHub               | {{key:list.openGitHub}}     | The PR or issue itself.                                                            |
| Snooze until new activity    | {{key:dash.snooze}}         | The item leaves the list until something new happens on it. See [Snooze](#snooze). |
| Snooze until tomorrow        | {{key:dash.snoozeTomorrow}} | The item leaves the list until tomorrow at 9:00.                                   |
| Mute                         | {{key:dash.mute}}           | The item leaves the list until you unmute it.                                      |
| Mark as read or unread       | {{key:dash.read}}           | See [Unread](#unread).                                                             |
| Show snoozed and muted items | {{key:dash.showSnoozed}}    | Lists the items that you snoozed or muted, to wake one up or unmute it.            |
| Copy link                    | {{key:list.copy}}           | Copies the links of the item or the selection.                                     |
| Refresh                      | {{key:list.refresh}}        | Searches GitHub again now.                                                         |

Right-click an item (or choose **⋯** on a phone) for these actions and more, such as its categories. To change the items of this menu, see [Menus](/docs/appearance-and-menus#menus).

## Snooze

Snooze takes an item out of the list for a while. Choose **Snooze** in the item's menu (right-click, or **⋯** on a phone), in the bar at the bottom of the [peek](/docs/peek), or in the bar for a selection. The choices:

- **Until new activity**: the item comes back when something new happens on it on GitHub, such as a comment, a review, or a commit. This is {{key:dash.snooze}}.
- **A time**: 1 hour, 3 hours, tomorrow at 9:00 ({{key:dash.snoozeTomorrow}}), or next Monday at 9:00. The item comes back at that time, also if something happens before.
- **Until something happens**: CI passes, CI finishes, someone approves, a new review, new commits, someone replies, or it is merged or closed. The item comes back when that happens, when it is merged or closed, or after 7 days. A choice that is already true is greyed out.

**Mute** takes an item out of the list until you unmute it.

The **Snoozed** button at the top shows the number of snoozed and muted items. Choose it to list them, with until when each one sleeps. **Wake up** ({{key:dash.snooze}}) puts an item back in the list now; **Unmute** ({{key:dash.mute}}) ends a mute.

When a snooze ends because the thing happened, Hush pushes, for example “Snooze over: CI passed”. See [What gets pushed](/docs/notifications#what-gets-pushed).

Snooze and Mute stay in Hush. They do not change your notifications on GitHub.

## Unread

An item is unread when you did not look at it in Hush yet, or when something new happened on it since you last looked. A new label alone does not count. An unread item has a dot on its avatar and a bold title.

You look at an item when you open it in the peek, open its full page, or open it on GitHub from Hush. If you opened one by mistake, press {{key:dash.read}} to make it unread again: the peek does not mark it as read again until you open it again. {{key:dash.read}} marks it as read or unread. To mark every item in the view as read, choose **Mark all as read** in {{key:palette}}.

The number on each view in the top bar is the number of its unread items that are not snoozed or muted.

## Select many

Select many items to snooze, mute, mark as read, or copy them together.

- {{key:list.select}} selects or deselects the item under the cursor. {{key:list.extendNext}} and {{key:list.extendPrev}} extend the selection.
- ⌘-click (Ctrl-click) adds an item. Shift-click selects a range. {{key:list.selectAll}} selects all.
- With a selection, a bar at the bottom has **Snooze**, **Read**, and **Copy links**. The keys and the right-click menu act on all selected items.
- {{key:list.escape}} clears the selection.

## Refresh

Hush runs the searches of your views about every 15 minutes while it checks GitHub, also when no view is open. It keeps the results for 15 minutes. When you open a view after that, it shows the saved list at once ("Updating…") and searches GitHub again in the background; the list changes when the new results arrive.

A refresh is fast, also for large accounts. The searches ask only for each item's ID and update time (up to 100 results for each search). Then Hush reads the full details (CI, reviews, review threads, conflicts) only for items that are new, changed on GitHub, still running CI, or that it last read more than an hour ago. So a PR that did not change can show details up to an hour old. Press {{key:list.refresh}} to read everything again now. The peek always reads the item fresh. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
