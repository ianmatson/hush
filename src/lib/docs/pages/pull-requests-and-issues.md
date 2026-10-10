---
title: Pull requests and issues
description: The list in each view, grouped by whose turn it is.
---

Each [view](/docs/views) lists its open pull requests and issues, also when GitHub sent no notification about them. A switch at the top shows **Pull requests** or **Issues**. Hush groups the items by whose turn it is, and gives each item its [categories](#categories).

## Groups

| Group                 | Means                                         |
| --------------------- | --------------------------------------------- |
| **Your turn**         | You are the next person who must act.         |
| **Your team's turn**  | A review is requested from a team you are in. |
| **Waiting on others** | You did your part. Someone else must act.     |
| **Other**             | Drafts, and threads that only mention you.    |

The issue list shows **Your team's turn** only when you [move](#move-an-item-to-another-group) an issue there, because GitHub requests reviews only on pull requests. Choose the name of a group to close it or open it. **Other** is closed at first. This browser remembers your choice.

Inside a group, the most urgent items come first (failing CI before a comment), then the ones that waited longest. Each item says why it is in its group:

| Group             | Pull requests                                                                                                                                                                                                | Issues                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Your turn         | CI failing · Changes requested · Merge conflict · 2 open threads · Ready to merge · @alice commented (on your PR) · Review requested · Re-review requested · Assigned to you · New commits since your review | Assigned to you · @alice replied                           |
| Your team's turn  | Review for acme/web                                                                                                                                                                                          |                                                            |
| Waiting on others | CI running · Waiting for review · Waiting on author · You approved · Waiting for a reply · @alice reviewed (with [`any_review`](/docs/settings#reviewresolution))                                            | Waiting for replies · No replies yet · Waiting for a reply |
| Other             | Draft · Bot PR · the view's name                                                                                                                                                                             | the view's name                                            |

The rules are the same as for the inbox's [Needs you](/docs/inbox#what-needs-you).

A row also lists what changed since you last looked at the item (“+2 commits”, “CI fails”), the same as in the inbox: see [Since you looked](/docs/inbox#since-you-looked).

### Stale

An item whose turn started more than 3 days ago is **stale**: it says how long it waited (“waiting 5d”) in amber. Change the number of days with [`dash.staleDays`](/docs/settings#dash-staledays).

## Stacked pull requests

A pull request is on top of another one when its base branch is the head branch of the other one. Hush shows a stack as one row, in the place of its most urgent pull request. Stacks from `gh stack`, Graphite, and branches that you made yourself are all the same to Hush.

- The row shows the stack's most urgent pull request first. “2 of 4” is its place in the stack, from the base branch up. Click the row to peek it.
- The [peek](/docs/peek) lists the whole stack at the top. {{key:dash.stackDown}} and {{key:dash.stackUp}} move down and up the stack, and the row in the list turns to show the same pull request as the peek.
- A pull request that is in the stack but not in this view shows as “Not in this list”. You can peek it, but it has no actions in the list.
- Drag the row to move the whole stack to another group.

Hush finds up to 3 open pull requests under each pull request in your list, in the same repository.

## Categories

An item has one [category](/docs/categories) from each category group, or none when it is **Not sorted** there. Their icons show on each row; to show their names too, turn on **Category names** in **Settings → General → Row contents**. The category button, next to **Refresh from GitHub**, lists every group and its categories, with counts: choose one to see only its items, **Not sorted** to see the items with no category from that group, and **Every category** to see all. The turn groups stay the same.

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

### Not my turn

When an item in **Your turn** is not your turn, press {{key:dash.notNeeded}}, or choose **Not my turn** at the top of the [peek](/docs/peek) or in its menu. The answers are the same as [Doesn't need me](/docs/inbox#doesnt-need-me) in the inbox: they fix a setting, or move only this item to Other (and its thread in the inbox to FYI) until it changes.

### Move an item to another group

If Hush puts an item in the wrong group, drag it (by ⋮⋮) to another group or to another place in the list, or use **Move to** in its menu. The item stays where you put it **until it changes** on GitHub; then Hush sorts it again. “Moved by you” shows on it; **Undo move** puts it back. Your order inside a group stays too; new items come in on top.

Select many items to move, hide, or copy them together, the same as in the [inbox](/docs/inbox#select-many).

## Refresh

Hush runs the searches of your views about every 15 minutes while it checks GitHub, also when no view is open. It keeps the results for 15 minutes. When you open a view after that, it shows the saved list at once ("Updating…") and searches GitHub again in the background; the list changes when the new results arrive.

A refresh is fast, also for large accounts. The searches ask only for each item's ID and update time (up to 100 results for each search). Then Hush reads the full details (CI, reviews, review threads, conflicts) only for items that are new, changed on GitHub, still running CI, or that it last read more than an hour ago. So a PR that did not change can show details up to an hour old. Press {{key:list.refresh}} to read everything again now. The peek always reads the item fresh. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
