---
title: Inbox
description: Which notifications come in, how Hush sorts them, what each tab and row shows, and how Done, Snooze, Mute, and Read work.
---

## What comes in

Hush tracks the pull requests and issues that your [sources](/docs/pull-requests-and-issues#sources) find, and the ones that you [track by hand](/docs/pull-requests-and-issues#sources). Your GitHub notifications are a second stream of information about these items. Hush keeps only the notifications about them:

- A notification about a PR or issue that no source finds, and that you do not track, does not come in.
- A notification that is not about a PR or issue does not come in: releases, CI and workflow runs, discussions, commits, security alerts, and invitations. Hush removed the threads of this type that you had.
- When a notification is about a PR or issue that Hush does not track yet, Hush runs your sources again (at most every 5 minutes). If a source finds the item now, the notification comes in.
- Hush gets unread notifications again at the next sync (about every 15 minutes). Thus a notification that came before a source found its item is not lost.

Hush runs your sources about every 15 minutes while it checks GitHub, also when the Pull requests and Issues tabs are not open.

When your sources stop finding a PR or issue (for example, it was merged or closed, or a review request ended), Hush tracks it for 14 days more. Thus its last notifications still come in. When you change your sources, or tab settings such as hidden bots or stale days, Hush stops at once to track the items that the new sources do not find, and removes their notifications.

## Tabs

| Tab           | What is in it                                                                    |
| ------------- | -------------------------------------------------------------------------------- |
| **Needs you** | Threads where you are the next person who must act.                              |
| **FYI**       | Activity that you may want to know about, but that does not need you.            |
| **Snoozed**   | Threads that you snoozed. They come back at the time, or when the thing happens. |
| **Done**      | Threads that you (or Hush) finished.                                             |
| **Muted**     | Threads that you muted.                                                          |

After these come your [notification views](/docs/views). Keys {{key:inbox.view.1}} to {{key:inbox.view.5}} open the built-in tabs, and {{key:inbox.view.6}} to {{key:inbox.view.9}} your first four notification views.

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
- New commits arrived since your review. To change this, set **New commits after my review need me** in Settings → Inbox ([`newCommitsAfterReview`](/docs/settings#newcommitsafterreview)).
- A review is requested from one of your teams, only with [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction) on.

**Issues:** it is assigned to you; or someone replied on an issue that is assigned to you or that you opened.

**Conversations:** a person mentioned you, or replied in a thread that you commented in (and you did not reply since).

With [smart decisions](/docs/settings#smartdecisions) on (the default), Hush also reads the newest comments. When they need nothing from you (thanks, approval, a status update, +1), a reply or a mention is FYI, and a comment on your PR or issue is not your turn.

Everything else is **FYI**: team mentions, repositories that you watch, merged and closed work. With [`botsAreFyi`](/docs/settings#botsarefyi) on (the default), PRs, comments, and mentions by bots are FYI too. A review request to you by name still needs you, also on a bot's PR.

Turn the bot, team, and smart decisions settings on or off in **Settings → Inbox → Defaults**.

The same rules make the “Your turn” group on the [Pull requests and Issues tabs](/docs/pull-requests-and-issues), so an item is in Needs you exactly when it is your turn there. The one difference: with `teamReviewsAreAction` on, a team review request is in Needs you, and in “Your team's turn” on the Pull requests tab. To change where threads go, use [Doesn't need me](#doesnt-need-me), or a setting such as [`botsAreFyi`](/docs/settings#botsarefyi). Categories do not change where threads go.

## Rows

Each row shows:

- **What happened**, in one line: “CI failed on your PR”, “@alice requests your review”, “@github-actions commented on your PR”.
- The title, the repository, and the number.
- **Why GitHub notified you**: “Review requested”, “You opened this”, “Watching repo”… A row does not show a fact twice: when the first line already says why, or that it is a draft, that tag is left out.
- The icons of its PR or issue's [categories](/docs/categories). Hold the pointer on an icon to see its name.
- **What changed since you looked**, for a PR or issue: “+2 commits”, “CI fails”, “@alice approved”, “3 new comments”. See [Since you looked](#since-you-looked).
- A note such as “✓ You approved” when Hush moved it to Done by itself.
- The time and the condition of a snooze.
- A dot when it is unread.
- The **main action** button: Review, Fix CI, Address, Resolve, Merge, Reply, Triage, or Open. It opens the right page on GitHub (the files of a PR to review, its checks to fix CI) and marks the thread as read.

To choose the parts that rows show, go to **Settings → General → Row contents**. The Notifications row has **Categories** and **Category names** parts, and more. See [`rows.thread`](/docs/settings#rows-thread).

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

**Done is for one event; Mute is for the whole PR or issue.** Done only clears the notification: a pull request or issue has many events, so it stays on the [Pull requests and Issues tabs](/docs/pull-requests-and-issues#actions). Mute hides it there too, until you unmute it, and **Mute** there mutes its thread here. Unmute works on both.

### What comes back by itself

- **New activity brings a Done thread back.** When GitHub sends a new notification for it, the thread is in the inbox again. A muted thread stays muted.
- **Hush finishes threads for you.** When a thread in Needs you stops needing you (you approved, you pushed a fix, CI passes now, it was merged), Hush moves it to Done with a note that says why. If it needs you again within 7 days (someone requests changes again, CI fails again), it comes back to Needs you.
- **FYI about work that closed** moves to Done when it is merged or closed.

## Doesn't need me

When Hush puts a thread in Needs you and it does not need you, press {{key:inbox.notNeeded}}, or choose **Doesn't need me** at the top of the [peek](/docs/peek) or in the right-click menu. Hush asks **Why doesn't this need you?**, and each answer fixes what would have been right:

| Answer                                        | What changes                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Someone else already reviewed it**          | Sets [`reviewResolution`](/docs/settings#reviewresolution) to `"any_review"`: a review by someone else settles a review request.               |
| **New commits after my review don't need me** | Sets [`newCommitsAfterReview`](/docs/settings#newcommitsafterreview) to `"never"`: new commits on a PR that you reviewed are not your turn.    |
| **Team review requests don't need me**        | Turns off [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction).                                                                       |
| **A bot opened it**                           | Turns on [`botsAreFyi`](/docs/settings#botsarefyi).                                                                                            |
| **Only this one**                             | Moves only this thread to FYI, until it changes (a new notification). Its PR or issue also goes to Other on the Pull requests and Issues tabs. |

Hush shows only the answers that would change something for this thread. After each one, **Undo** in the message puts everything back. A thread that you moved says “You said: doesn't need me”.

## Snooze

The Snooze menu has times and conditions. A time is on your computer's clock.

- For 1 hour, for 3 hours, until tomorrow 9:00, or until next Monday 9:00.
- **Until something happens**:

{{ref:snooze}}

A snooze “until” also ends after 7 days, so nothing sleeps forever. If the PR or issue is merged or closed first, the snooze ends at once, because the event can no longer happen. When a snooze ends because the thing happened, Hush pushes “Snooze over: CI passed”. Conditions that are already true are not offered.

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

`category:` works here too. It matches the categories of the thread's PR or issue: `category:high-effort`.

To keep a filter, choose the bookmark button at the end of the box: **Save this filter as a notification view (a new tab)**. See [Notification views](/docs/views).

### Search everywhere

While the box has text, choose **Search: everywhere** under it to search every thread: Needs you, FYI, Snoozed, Done, and Muted. Each result says which list it is in. Done, Snooze, and Mute work on the results that are in the inbox; **Move to inbox** and **Unmute** on the others. **This tab** searches the tab again.

## Right-click menu

Right-click a row (or choose “⋯” on a phone) for every action: Peek, the main action, Open on GitHub, Done, Snooze, Mute, Move to inbox, Mark as read, Copy link, **Make a category…**, and selection. With a selection, the menu acts on all selected rows. You can change the items and their order: see [Menus](/docs/appearance-and-menus#menus).

**Make a category…** opens **Settings → Categories** with a new category in your first group. Its rule is this thread's repository and type. Change it, and choose **Save**. See [Categories](/docs/categories).

## Sync

Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)), and open tabs update at once when something changes. The line under the tabs says “Synced 2m ago”, or “Syncing…” while a check runs.

To check now, press {{key:list.refresh}} or choose the refresh button. This also looks again at up to 40 threads in the inbox, and moves the ones that no longer need you to Done.
