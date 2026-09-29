---
title: Pull requests and issues
description: The dashboards of open work that involves you, grouped by whose turn it is.
---

The **Pull requests** and **Issues** tabs show open work that involves you, also when GitHub sent no notification about it. Each tab is a set of saved GitHub searches, called **sections**. Hush groups the results by whose turn it is.

## Groups

| Group                 | Means                                         |
| --------------------- | --------------------------------------------- |
| **Your turn**         | You are the next person who must act.         |
| **Your team's turn**  | A review is requested from a team you are in. |
| **Waiting on others** | You did your part. Someone else must act.     |
| **Other**             | Drafts, and threads that only mention you.    |

Inside a group, the most urgent items come first (failing CI before a comment), then the ones that waited longest. Each item says why it is in its group:

| Group             | Pull requests                                                                                                                                                                                                     | Issues                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Your turn         | CI failing · Changes requested · Merge conflict · Open review threads · Ready to merge · @alice commented (on your PR) · Review requested · Re-review requested · Assigned to you · New commits since your review | Assigned to you · @alice replied                           |
| Your team's turn  | Review for acme/web                                                                                                                                                                                               |                                                            |
| Waiting on others | CI running · Waiting for review · Waiting on author · You approved · Waiting for a reply · @alice reviewed (with [`any_review`](/docs/settings#reviewresolution))                                                 | Waiting for replies · No replies yet · Waiting for a reply |
| Other             | Draft · Bot PR · the section's name                                                                                                                                                                               | the section's name                                         |

The rules are the same as for the inbox's [Needs you](/docs/inbox#what-needs-you).

A row also lists what changed since you last looked at the item (“+2 commits”, “CI fails”), the same as in the inbox: see [Since you looked](/docs/inbox#since-you-looked).

### Stale

An item whose turn started more than 3 days ago is **stale**: it says how long it waited (“waiting 5d”) in amber. Change the number of days with [`dash.staleDays`](/docs/settings#dash-staledays).

## Sections

The sections are tabs above the list: **All**, then each section with its count. {{key:dash.section.0}} shows all; {{key:dash.section.1}} to {{key:dash.section.9}} show one section. An item can be in more than one section.

The default sections:

- **Pull requests:** Review requested from you, Team review requests, Your PRs, You reviewed, Assigned to you, Mentions you. “Mentions your teams” is off.
- **Issues:** Assigned to you, You opened, Mentions you, You commented. “Mentions your teams” is off.

Change them in **Settings → PRs & issues**:

- Each section has a name and a [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests). `@me` is you. `@team` runs the search once for each team that you track.
- Turn a section off with its switch, move it up or down, delete it, or choose **Add section**. The link button opens the same search on GitHub, to check it.
- **Scope** is added to every search: for example `org:acme`, or `-repo:acme/website`.
- **Teams** lists your teams. Turn off big teams (such as “everyone”) to cut noise. **Look up teams again** finds new teams at once; otherwise Hush looks every 6 hours.
- **Defaults** puts back the default sections. Nothing changes until you choose **Save**.

More options are only in [settings.json](/docs/settings): hide others' drafts ([`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts)), hide bots' PRs ([`dash.hideBots`](/docs/settings#dash-hidebots)), and the stale days.

## Actions

| Action                | Key                     | What it does                                                                                                                                                                                           |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Peek                  | {{key:list.peek}}       | Read it in the [peek](/docs/peek), and act on GitHub from there.                                                                                                                                       |
| Main action           | {{key:list.open}}       | Review, Fix CI, Reply… on GitHub.                                                                                                                                                                      |
| Open on GitHub        | {{key:list.openGitHub}} | The PR or issue itself.                                                                                                                                                                                |
| Hide until it changes | {{key:dash.hide}}       | Hides the item until something new happens on it, and moves its thread in the inbox to Done (also on GitHub). Done in the inbox hides it here too.                                                     |
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

Hush keeps the results for 15 minutes, and searches GitHub again when you open the tab after that. Press {{key:list.refresh}} to search now. When a search fails, a message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), the message links to [GitHub access](/docs/github-access).
