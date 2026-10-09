---
title: Pull requests and issues
description: The dashboards of open work that involves you, grouped by whose turn it is.
---

The **Pull requests** and **Issues** tabs show open work that involves you, also when GitHub sent no notification about it. Your [sources](#sources), saved GitHub searches, decide what Hush tracks. The inbox gets only the notifications about these items. Hush groups the results by whose turn it is, and gives each item its [categories](#categories).

## Groups

| Group                 | Means                                         |
| --------------------- | --------------------------------------------- |
| **Your turn**         | You are the next person who must act.         |
| **Your team's turn**  | A review is requested from a team you are in. |
| **Waiting on others** | You did your part. Someone else must act.     |
| **Other**             | Drafts, and threads that only mention you.    |

The Issues tab shows **Your team's turn** only when you [move](#move-an-item-to-another-group) an issue there, because GitHub requests reviews only on pull requests. Choose the name of a group to close it or open it. **Other** is closed at first. This browser remembers your choice.

Inside a group, the most urgent items come first (failing CI before a comment), then the ones that waited longest. Each item says why it is in its group:

| Group             | Pull requests                                                                                                                                                                                                | Issues                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Your turn         | CI failing · Changes requested · Merge conflict · 2 open threads · Ready to merge · @alice commented (on your PR) · Review requested · Re-review requested · Assigned to you · New commits since your review | Assigned to you · @alice replied                           |
| Your team's turn  | Review for acme/web                                                                                                                                                                                          |                                                            |
| Waiting on others | CI running · Waiting for review · Waiting on author · You approved · Waiting for a reply · @alice reviewed (with [`any_review`](/docs/settings#reviewresolution))                                            | Waiting for replies · No replies yet · Waiting for a reply |
| Other             | Draft · Bot PR · the source's name                                                                                                                                                                           | the source's name                                          |

The rules are the same as for the inbox's [Needs you](/docs/inbox#what-needs-you).

A row also lists what changed since you last looked at the item (“+2 commits”, “CI fails”), the same as in the inbox: see [Since you looked](/docs/inbox#since-you-looked).

### Stale

An item whose turn started more than 3 days ago is **stale**: it says how long it waited (“waiting 5d”) in amber. Change the number of days with [`dash.staleDays`](/docs/settings#dash-staledays).

## Stacked pull requests

A pull request is on top of another one when its base branch is the head branch of the other one. Hush shows a stack as one row, in the place of its most urgent pull request. Stacks from `gh stack`, Graphite, and branches that you made yourself are all the same to Hush.

- The row shows the stack's most urgent pull request first. “2 of 4” is its place in the stack, from the base branch up. Click the row to peek it.
- The [peek](/docs/peek) lists the whole stack at the top. {{key:dash.stackDown}} and {{key:dash.stackUp}} move down and up the stack, and the row in the list turns to show the same pull request as the peek.
- A pull request that is in the stack but not in your sources shows as “Not in this list”. You can peek it, but it has no actions in the list.
- Drag the row to move the whole stack to another group.

Hush finds up to 3 open pull requests under each pull request in your list, in the same repository.

## Sources

A source is a saved [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests). Hush tracks every open PR and issue that any of your sources finds. The [inbox](/docs/inbox#what-comes-in) gets only the notifications about these items and your tracked items.

When the sources stop finding an item (it was merged or closed, or a review request ended), Hush tracks it for 14 days more, so its last notifications still come in. When you change your sources, the scope, or a setting such as hidden bots or stale days, Hush stops at once to track the items that the sources do not find now, and removes their notifications.

{{ref:sources}}

The chips above the list are your sources: **All**, then each source with its count. {{key:dash.section.0}} shows all; {{key:dash.section.1}} to {{key:dash.section.9}} show one source. An item can be found by more than one source.

Change them in **Settings → Sources**:

- Each source has a name and a search. `@me` is you. `@team` runs the search once for each team that you track. `team-review-requested:@team` is one search for all of them: Hush searches `review-requested:@me` and keeps the PRs that ask one of your tracked teams (it leaves out your own PRs).
- A search with `is:pr`, or a word that only pull requests have (such as `review-requested:` or `reviewed-by:`), finds pull requests. With `is:issue`, issues. With neither, both.
- Turn a source off with its switch, move it up or down, delete it, or choose **Add source**. The link button opens the same search on GitHub, to check it.
- **Tracked items:** paste the address of a PR or issue (or `owner/repo#123`). Hush shows it while it is open, whatever the sources find.
- **Scope** is added to every search: for example `org:acme`, or `-repo:acme/website`.
- **Teams** lists your teams. Turn off big teams (such as “everyone”) to cut noise. **Look up teams again** finds new teams at once; otherwise Hush looks every 6 hours.
- **Defaults** puts back the default sources. Nothing changes until you choose **Save**.

### Project boards

A source can read a GitHub project board. Name the project with `project:` and one or more columns with `status:`:

`project:acme/12 status:"This week","In progress" no:assignee`

- Hush reads this source from the board, not with GitHub search. The rest of the search uses the [board's filter words](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects), such as `assignee:@me`, `no:assignee`, `label:bug`, and `-status:Done`.
- `acme/12` is the owner of the project and its number, from the project's address (`github.com/orgs/acme/projects/12`).
- The **Scope** is not added to a board source.
- Draft items on the board are left out: they are not pull requests or issues.
- Hidden bots and others' drafts are not hidden here: someone put them on the board.
- It needs the `project` scope. A token from before Hush read boards does not have it: then a note above the list says so. See [project boards](/docs/github-access#project-boards).

A search with `project:` but no `status:` is a normal GitHub search: it finds every open item in the project, whatever its column.

**Filters** in **Settings → Sources** hide drafts that others opened ([`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts)) and PRs and issues that bots opened ([`dash.hideBots`](/docs/settings#dash-hidebots)), such as dependabot or a GitHub App. Both are on by default. The stale days are only in [settings.json](/docs/settings).

## Categories

An item can have [categories](/docs/categories), from one or more category groups. Their icons show on each row; to show their names too, turn on **Category names** in **Settings → General → Row contents**. The category button, next to **Refresh from GitHub**, lists every group and its categories, with counts: choose one to see only its items, and **Every category** to see all. The turn groups stay the same.

To change an item's categories, right-click it and choose the name of a group, such as **Effort**. In a group with one category per item, choose a category. In a group with any number per item, choose a category to turn it on or off. **Choose automatically** removes your choices for that group. This works on a selection too.

Set up category groups, and how Hush places items, in **Settings → Categories**. See [Categories](/docs/categories).

## External contributors

An item opened by someone who is not a member or collaborator of the repository has an **External** badge. It shows **First-time** when it is their first pull request or issue there. Bots get no badge. To turn the badge off, go to **Settings → General → Row contents** and turn off **External contributor**; the [peek](/docs/peek) follows the same setting.

## Filter

The filter box above the list finds items by text. An item shows when the text is in its title, repository, author, turn reason, or labels. {{key:list.search}} goes to the box.

Text with a `word:` in it is a [query](/docs/query-language): `repo:acme/web label:bug`, `review-requested:@me size:<50`. `category:` works too: `category:high-effort`.

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

Hush runs your sources about every 15 minutes while it checks GitHub, also when the tabs are not open. It keeps the results for 15 minutes. When you open the tab after that, it shows the saved list at once ("Updating…") and searches GitHub again in the background; the list changes when the new results arrive.

A refresh is fast, also for large accounts. The searches ask only for each item's ID and update time (up to 100 results for each source). Then Hush reads the full details (CI, reviews, review threads, conflicts) only for items that are new, changed on GitHub, still running CI, or that it last read more than an hour ago. So a PR that did not change can show details up to an hour old. Press {{key:list.refresh}} to read everything again now. The peek always reads the item fresh. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
