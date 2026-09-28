---
title: Inbox
description: How Hush sorts notifications, what each tab and row shows, and how Done, Snooze, Mute, and Read work.
---

## Tabs

| Tab           | What is in it                                                                    |
| ------------- | -------------------------------------------------------------------------------- |
| **Needs you** | Threads where you are the next person who must act.                              |
| **FYI**       | Activity that you may want to know about, but that does not need you.            |
| **Snoozed**   | Threads that you snoozed. They come back at the time, or when the thing happens. |
| **Done**      | Threads that you (or Hush, or a rule) finished.                                  |
| **Muted**     | Threads that you muted, or that a rule mutes.                                    |

After these come your [saved views](/docs/views). Keys {{key:inbox.view.1}} to {{key:inbox.view.5}} open the built-in tabs, and {{key:inbox.view.6}} to {{key:inbox.view.9}} your first four saved views.

## What needs you

Hush reads each notification and the pull request or issue behind it (CI, reviews, comments, conflicts), and decides whose turn it is. A thread is in **Needs you** when one of these is true:

**Your pull requests** (not drafts):

- CI fails.
- Someone requested changes.
- It has merge conflicts.
- It is approved, but review threads are still open.
- It is approved and CI is not running: it is ready to merge.
- A person commented after your newest push.

**Other people's pull requests:**

- Your review is requested from you by name (or again, after your review).
- It is assigned to you.
- New commits arrived since your review.
- A review is requested from one of your teams, only with [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction) on.

**Issues:** it is assigned to you; or someone replied on an issue that is assigned to you or that you opened.

**Conversations:** a person mentioned you, or replied in a thread that you commented in (and you did not reply since).

**Other:** security and Dependabot alerts, repository invitations, deployments that wait for your approval, and workflow runs that failed.

Everything else is **FYI**: team mentions, repositories that you watch, merged and closed work, passing CI, releases. With [`botsAreFyi`](/docs/settings#botsarefyi) on (the default), PRs, comments, and mentions by bots are FYI too. A review request to you by name still needs you, also on a bot's PR.

The same rules make the “Your turn” group on the [Pull requests and Issues tabs](/docs/pull-requests-and-issues), so an item is in Needs you exactly when it is your turn there. To change where threads go, write [rules](/docs/rules).

## Rows

Each row shows:

- **What happened**, in one line: “CI failed on your PR”, “@alice requests your review”, “@github-actions commented on your PR”.
- The title, the repository, and the number.
- **Why GitHub notified you**: “Review requested”, “You opened this”, “Watching repo”…
- **rule: …** when one of your rules sorted it.
- **What changed since you looked**, for a PR or issue: “+2 commits”, “CI fails”, “@alice approved”, “3 new comments”. See [Since you looked](#since-you-looked).
- A note such as “✓ You approved” when Hush moved it to Done by itself.
- The time and the condition of a snooze.
- A dot when it is unread.
- The **main action** button: Review, Fix CI, Address, Resolve, Merge, Reply, Triage, or Open. It opens the right page on GitHub (the files of a PR to review, its checks to fix CI) and marks the thread as read.

Click a row to [peek](/docs/peek) at it.

### Since you looked

Hush remembers what a pull request or issue looked like when you last looked at it: when it stays open in the peek for a moment, or when you open it on GitHub, from the inbox or from the Pull requests and Issues tabs. After that, its rows and its peek list what changed since then:

- New commits, new comments, and new reviews (“@alice approved”, “@bob requested changes”).
- CI: “CI fails”, “CI passes now”, “CI running”.
- Your review requested again; merged, closed, or reopened; ready for review or back to draft; new labels.

Before your first look, nothing is listed. Your own changes do not count.

## Triage

Each action works on the row under the cursor, or on every selected row.

| Action                         | Key                  | What it does                                                                               |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------ |
| **Done**                       | {{key:inbox.done}}   | Moves the thread to Done, and marks it done on GitHub.                                     |
| **Snooze**                     | {{key:inbox.snooze}} | Hides it until tomorrow at 9:00. The Snooze menu has more times and conditions.            |
| **Mute**                       | {{key:inbox.mute}}   | Moves it to Muted, and unsubscribes you on GitHub, so GitHub stops notifying you about it. |
| **Read / Unread**              | {{key:inbox.read}}   | Marks it as read (also on GitHub) or unread (only in Hush).                                |
| **Move to inbox** / **Unmute** |                      | In Snoozed, Done, and Muted: brings it back.                                               |

After each action, a message with **Undo** shows for a few seconds.

**One record for each PR and issue.** Done or Mute on a pull request or issue also hides it on the [Pull requests and Issues tabs](/docs/pull-requests-and-issues#actions), until it changes. **Hide until it changes** there also moves its thread to Done here. Moving it back (Undo, Move to inbox, Show again) works on both.

### What comes back by itself

- **New activity brings a Done thread back.** When GitHub sends a new notification for it, the thread is in the inbox again. A muted thread stays muted.
- **Hush finishes threads for you.** When a thread in Needs you stops needing you (you approved, you pushed a fix, CI passes now, it was merged), Hush moves it to Done with a note that says why. If it needs you again within 7 days (someone requests changes again, CI fails again), it comes back to Needs you.
- **FYI about work that closed** moves to Done when it is merged or closed.

## Doesn't need me

When Hush puts a thread in Needs you and it does not need you, press {{key:inbox.notNeeded}}, or choose **Doesn't need me** at the top of the [peek](/docs/peek) or in the right-click menu. Hush asks **Why doesn't this need you?**, and each answer fixes what would have been right:

| Answer                                 | What changes                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Someone else already reviewed it**   | Sets [`reviewResolution`](/docs/settings#reviewresolution) to `"any_review"`: a review by someone else settles a review request.             |
| **Team review requests don't need me** | Turns off [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction).                                                                     |
| **A bot opened it**                    | Turns on [`botsAreFyi`](/docs/settings#botsarefyi).                                                                                          |
| **I don't work on acme/website**       | Adds a [rule](/docs/rules) at the top: `repo:acme/website` is FYI.                                                                           |
| **Only this one**                      | Moves only this thread to FYI, until it changes (a new notification). For a PR or issue, also to Other on the Pull requests and Issues tabs. |

Hush shows only the answers that would change something for this thread. After each one, **Undo** in the message puts everything back. A thread that you moved says “You said: doesn't need me”.

## Snooze

The Snooze menu has times and conditions. A time is on your computer's clock.

- For 1 hour, for 3 hours, until tomorrow 9:00, or until next Monday 9:00.
- **Until something happens**:

{{ref:snooze}}

A snooze “until” also ends after 7 days, so nothing sleeps forever. If the PR or issue is merged or closed first, the snooze ends at once, because the event can no longer happen. When a snooze ends because the thing happened, Hush pushes “Snooze over: CI passed”. Conditions that are already true are not offered.

A [rule](/docs/rules) can snooze threads for a number of hours when they arrive.

## Select many

- {{key:list.select}} selects or deselects the row under the cursor. {{key:list.extendNext}} and {{key:list.extendPrev}} extend the selection.
- ⌘-click (Ctrl-click) adds a row; Shift-click selects a range; {{key:list.selectAll}} selects all.
- With a selection, a bar at the bottom has Done, Snooze, Mute, and Read. The keys and the right-click menu act on all selected rows.
- {{key:list.escape}} clears the selection.

## Filter

The filter box above the list takes words and [query words](/docs/query-language):

```query
repo:acme/* needs:review -author:bots
```

Plain words must all be in the title, the repository, or the author. Suggestions show while you type; {{key:list.search}} goes to the box. When a filter has an error, the message shows under the box, and the part with the error is left out.

To keep a filter, choose the bookmark button at the end of the box: **Save this filter as a view (a new tab)**. See [Saved views](/docs/views).

## Right-click menu

Right-click a row (or choose “⋯” on a phone) for every action: Peek, the main action, Open on GitHub, Done, Snooze, Mute, Move to inbox, Mark as read, Copy link, **Make a rule…**, and selection. With a selection, the menu acts on all selected rows. You can change the items and their order: see [Menus](/docs/appearance-and-menus#menus).

**Make a rule…** opens **Settings → Inbox** with a new rule for this thread's repository and type.

## Sync

Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)), and open tabs update at once when something changes. The line under the tabs says “Synced 2m ago”, or “Syncing…” while a check runs.

To check now, press {{key:list.refresh}} or choose the refresh button. This also looks again at up to 40 threads in the inbox, and moves the ones that no longer need you to Done.
