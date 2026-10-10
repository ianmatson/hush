---
title: Pull requests and issues
description: The list in each view, and how Group by puts it into sections.
---

Each [view](/docs/views) lists its open pull requests and issues, also when GitHub sent no notification about them. A switch at the top shows **Pull requests**, **Issues**, or **Both** (when the view finds both types). {{key:dash.kind}} changes it, and this browser remembers the choice for each view. Each item has its [categories](#categories).

## Group by

The **Group by** button, at the top right, puts the list into sections. Each view keeps its own choice (the [`groupBy`](/docs/settings#views) of the view): **Mine** starts with **Your role**, and a new view with **Status**.

| Group by                         | Sections                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **None**                         | One list, with no sections.                                                                                                                            |
| **Your role**                    | **You opened**, **Reviews** (your review or your team's review is requested, or you reviewed it), **Assigned to you**, **Involved** (everything else). |
| **Status**                       | Pull requests: **No review yet**, **In review**, **Changes requested**, **Approved**, **Drafts**. Issues: **Unassigned**, **Assigned**.                |
| **Repository**, **Author**       | One section for each repository, or each author, in name order.                                                                                        |
| **Label**, **Assignee**          | One section for each set of labels, or of assignees, such as “bug, docs”. An item with none is in **No labels** or **No assignee**.                    |
| A category group, such as Effort | One section for each category, then **Not sorted** for the items that have no category from the group. See [Categories](/docs/categories).             |

An item is in exactly one section. Sections with no items do not show. Choose the name of a section to close it or open it; **Drafts** is closed at first. This browser remembers your choice for each view and each Group by.

With **Both**, Status shows the pull request sections first, then the issue sections.

{{key:palette}} finds the Group by choices too: type “group by”.

## Order and reasons

Inside a section, the items that need you come first, the most urgent first (failing CI before a comment), then the ones that waited longest. Each row says what is going on, in a few words:

- **Pull requests:** CI failing · Changes requested · Merge conflict · 2 open threads · Ready to merge · @alice commented · Review requested · Re-review requested · Assigned to you · New commits since your review · Review for acme/web · CI running · Waiting for review · Waiting on author · You approved · Draft · Bot PR.
- **Issues:** Assigned to you · @alice replied · Waiting for replies · No replies yet · Waiting for a reply.

The same rules decide the inbox's [Needs you](/docs/inbox#what-needs-you).

A row also lists what changed since you last looked at the item (“+2 commits”, “CI fails”), the same as in the inbox: see [Since you looked](/docs/inbox#since-you-looked).

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

| Action                | Key                     | What it does                                                                                                                                                                                           |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Peek                  | {{key:list.peek}}       | Read it in the [peek](/docs/peek), and act on GitHub from there.                                                                                                                                       |
| Main action           | {{key:list.open}}       | Review, Fix CI, Reply… on GitHub.                                                                                                                                                                      |
| Open on GitHub        | {{key:list.openGitHub}} | The PR or issue itself.                                                                                                                                                                                |
| Hide until it changes | {{key:dash.hide}}       | Hides the item until something new happens on it. The inbox does not change (Done there does not hide it here).                                                                                        |
| Mute                  | {{key:dash.mute}}       | Hides the item until you unmute it, and mutes its thread in the inbox (you are unsubscribed on GitHub). Mute in the inbox mutes it here too. **Show hidden items** lists muted items, with **Unmute**. |
| Show hidden items     | {{key:dash.showHidden}} | Shows hidden items, to show one again.                                                                                                                                                                 |
| Copy link             | {{key:list.copy}}       | Copies the links of the item or the selection.                                                                                                                                                         |
| Refresh               | {{key:list.refresh}}    | Searches GitHub again now.                                                                                                                                                                             |

### Select many

Select many items to hide, mute, or copy them together, the same as in the [inbox](/docs/inbox#select-many).

## Refresh

Hush runs the searches of your views about every 15 minutes while it checks GitHub, also when no view is open. It keeps the results for 15 minutes. When you open a view after that, it shows the saved list at once ("Updating…") and searches GitHub again in the background; the list changes when the new results arrive.

A refresh is fast, also for large accounts. The searches ask only for each item's ID and update time (up to 100 results for each search). Then Hush reads the full details (CI, reviews, review threads, conflicts) only for items that are new, changed on GitHub, still running CI, or that it last read more than an hour ago. So a PR that did not change can show details up to an hour old. Press {{key:list.refresh}} to read everything again now. The peek always reads the item fresh. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
