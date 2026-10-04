---
title: Pull requests and issues
description: The dashboards of open work that involves you, grouped by whose turn it is.
---

The **Items** page shows the open pull requests and issues that Hush tracks, in two tabs: **Pull requests** and **Issues**. {{key:dash.section.0}} and {{key:dash.section.1}} switch between them. Your [sources](#sources) decide what Hush tracks; by default, open work that involves you. Hush groups the items by whose turn it is.

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

## Sources

A source is a saved [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests). Hush tracks every open PR and issue that any of your sources finds, also ones that do not involve you.

{{ref:sources}}

Change them in **Settings → Sources**:

- Each source has a name and a search. `@me` is you. `@team` runs the search once for each team that you track. `team-review-requested:@team` is one search for all of them: Hush searches `review-requested:@me` and keeps the PRs that ask one of your tracked teams.
- A search with `is:pr`, or a word that only pull requests have (such as `review-requested:` or `reviewed-by:`), finds pull requests. With `is:issue`, issues. With neither, both.
- Turn a source off with its switch, move it up or down, delete it, or choose **Add source**. The link button opens the same search on GitHub, to check it.
- **Track one item:** paste the address of a PR or issue (or `owner/repo#123`). Hush shows it while it is open, whatever the sources find.
- **Scope** is added to every search: for example `org:acme`, or `-repo:acme/website`.
- **Teams** lists your teams. Turn off big teams (such as “everyone”) to cut noise. **Look up teams again** finds new teams at once; otherwise Hush looks every 6 hours.
- **Defaults** puts back the default sources. Nothing changes until you choose **Save**.

## Categories and tags

Every item has exactly one **category** (where it lives) and any number of **tags** (what else is true about it). The sidebar lists them with their counts; choose one to see only its items. The turn groups and the Pull requests and Issues tabs stay the same in every view. On a phone, the menu at the top of the list does the same.

Hush places an item in this order:

1. A category that you chose for it (right-click → **Category**).
2. The first category whose rule matches, top to bottom.
3. Jev's choice among the categories that have a description, when it is sure enough (see [smart decisions](/docs/settings#smartdecisions)).
4. Otherwise **Other**, which cannot be deleted.

An item gets every tag whose rule matches, plus the tags that you add by hand (right-click → **Tags**); a tag that you remove by hand stays off.

Rules are [queries](/docs/query-language): `repo:`, `label:`, `author:@me`, `source:"Assigned to you"`, `size:<50`, OR, groups, and `about:"…"`, which asks Jev. Jev reads each item once, when Hush first sees it, and again when its title, description, or labels change; a new comment does not change its category or tags. After you change categories or tags, choose **Re-evaluate items** in **Settings → Categories & tags** to ask again for the items you have now. Rules without `about:` apply at once.

Hush starts with presets that you can change or delete: [categories](/docs/settings#categories) (Incidents, Features, Bugs, Maintenance, Other) and [tags](/docs/settings#tags) (Blocked, Needs decision, Security, Breaking change, Quick).

More options are only in [settings.json](/docs/settings): hide others' drafts ([`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts)), hide bots' PRs ([`dash.hideBots`](/docs/settings#dash-hidebots)), and the stale days.

## Filter

The filter box above the list finds items by text. An item shows when the text is in its title, repository, author, turn reason, or labels. {{key:list.search}} goes to the box. The query words of the inbox (`repo:`, `needs:`…) do not work here.

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

When an item in **Your turn** is not your turn, press {{key:dash.notNeeded}}, or choose **Not my turn** at the top of the [peek](/docs/peek) or in its menu. The answers are the same as [Doesn't need me](/docs/inbox#doesnt-need-me) in the inbox: they fix a setting, add a rule, or move only this item to Other (and its thread in the inbox to FYI) until it changes.

### Move an item to another group

If Hush puts an item in the wrong group, drag it (by ⋮⋮) to another group or to another place in the list, or use **Move to** in its menu. The item stays where you put it **until it changes** on GitHub; then Hush sorts it again. “Moved by you” shows on it; **Undo move** puts it back. Your order inside a group stays too; new items come in on top.

Select many items to move, hide, or copy them together, the same as in the [inbox](/docs/inbox#select-many).

## Refresh

Hush keeps the results for 15 minutes. When you open the tab after that, it shows the saved list at once ("Updating…") and searches GitHub again in the background; the list changes when the new results arrive.

A refresh is fast, also for large accounts. The searches ask only for each item's ID and update time (up to 50 results for each section). Then Hush reads the full details (CI, reviews, review threads, conflicts) only for items that are new, changed on GitHub, still running CI, or that it last read more than an hour ago. So a PR that did not change can show details up to an hour old. Press {{key:list.refresh}} to read everything again now. The peek always reads the item fresh. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
