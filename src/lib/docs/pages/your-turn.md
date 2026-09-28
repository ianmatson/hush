---
title: Your turn, Waiting, and Updates
description: The three lanes, what makes something your turn, why an item is where it is, and how Done, Snooze, Not my turn, and Mute work.
---

## The three lanes

Hush reads your notifications and the results of its [tracked searches](/docs/where-hush-looks), and makes one **item** for each pull request, issue, or other thread. It puts each item in one lane:

| Lane          | Key                 | What is in it                                                                |
| ------------- | ------------------- | ---------------------------------------------------------------------------- |
| **Your turn** | {{key:nav.turn}}    | You are the next person who must act.                                        |
| **Waiting**   | {{key:nav.waiting}} | You did your part. Someone else (a person, a team, or CI) must act next.     |
| **Updates**   | {{key:nav.updates}} | Everything else from the last 14 days, newest first. Nothing here needs you. |

After the lanes come your [saved searches](/docs/search#saved-searches). An item is in one lane only, and moves by itself when its turn changes: when you approve a PR, it goes from Your turn to Waiting (or out of the lanes when it is merged).

**Your turn** has two groups: **People are waiting on you** (reviews and replies) first, then **Your work** (your PRs that need a fix, a merge, an answer). Inside a group, the most urgent items come first (failing CI before a comment), then the ones that waited longest.

**Waiting** is grouped by whom each item waits on (“Waiting on @alice”, “Waiting on acme/web-core”, “CI running”). The group that waited longest comes first.

**Updates** is a feed, grouped by day. **Mark all seen** clears the dots. Items leave Updates after 14 days.

## What makes it your turn

Hush reads the facts behind each item (CI, reviews, review requests, comments, conflicts) and decides whose turn it is. An item is in **Your turn** when one of these is true:

**Your pull requests** (not drafts):

- CI fails.
- Someone requested changes.
- It has merge conflicts.
- It is approved, but review threads are still open.
- It is approved and CI is not running: it is ready to merge.
- A person commented after your newest push.

**Other people's pull requests** (not drafts, unless your review is requested):

- Your review is requested from you by name (or again, after your review).
- It is assigned to you.
- New commits arrived since your review.
- A review is requested from one of your teams, only with [`teamReviewsAreMine`](/docs/settings#teamreviewsaremine) on.

**Issues:** it is assigned to you; or someone replied on an issue that is assigned to you or that you opened.

**Conversations:** a person mentioned you, or replied in a thread that you commented in (and you did not reply since).

**Other:** security and Dependabot alerts, repository invitations, deployments that wait for your approval, and workflow runs that failed.

An item is in **Waiting** when you did your part: your PR waits for review or for CI, you approved or asked for changes and the author must act, you asked a question and wait for a reply, or a review is requested from your team (with [`teamReviewsAreMine`](/docs/settings#teamreviewsaremine) off).

Everything else is in **Updates**: team mentions, repositories that you watch, merged and closed work, releases, others' drafts. With [`botsAreUpdates`](/docs/settings#botsareupdates) on (the default), PRs that bots open, and comments and mentions by bots, are updates too. **A review request to you by name is always your turn**, also on a bot's PR.

To change where items go, choose [Not my turn](#not-my-turn) or write [rules](/docs/rules).

## Rows

Each row shows:

- **What it needs from you**, in one line: “CI failed on your PR”, “@alice requests your review”, “Waiting for review · @bob”.
- **How long it waited** (Your turn and Waiting), or when it last changed (Updates). In amber when it is [stale](/docs/settings#staledays).
- The repository, the number, and the title.
- **What changed since you looked**: “+2 commits”, “CI fails”, “@alice approved”, “3 new comments”. See [Since you looked](#since-you-looked).
- A note such as “✓ You approved” when Hush moved it by itself; “You said: not my turn” when you moved it; “rule: …” when one of your rules placed it.
- A dot when something is new since you looked.
- The **main action** button: Review, Fix CI, Address, Resolve, Merge, Reply, Triage, or Open. It opens the right page on GitHub (the files of a PR to review, its checks to fix CI).

Click a row to [peek](/docs/peek) at it.

## Why it is here

The top of the [peek](/docs/peek) says why the item is in its lane, in plain words: “Your turn: Re-review requested for 2d.”, “Waiting: Waiting for review on @alice for 5d.”, with the rule that placed it, or “Hush moved it: You approved.” Next to it is **Not my turn** (in Your turn) or **It is my turn** (in the other lanes).

## Since you looked

Hush remembers what an item looked like when you last saw it. **You see an item** when it stays open in the peek for a moment, when you open it on GitHub, or with **Mark all seen** in Updates.

When you come back, the row and the peek list what changed since then:

- New commits, new comments, and new reviews (“@alice approved”, “@bob requested changes”).
- CI: “CI fails”, “CI passes now”, “CI running”.
- Your review requested again; merged, closed, or reopened; ready for review or back to draft; new labels.

The dot on a row means that something is new since you looked. With **Keep GitHub in step** on ([`markReadOnGitHub`](/docs/settings#markreadongithub)), seeing an item also marks its notification read on GitHub.

## Not my turn

When Hush puts an item in Your turn and it is not your turn, press {{key:item.notMine}} or choose **Not my turn** at the top of the peek. Hush asks **Why is this not your turn?**, and each answer fixes what would have been right:

| Answer                                | What changes                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Someone else already reviewed it**  | Sets [`reviewResolution`](/docs/settings#reviewresolution) to `"any_review"`: a review by someone else settles a review request, for every item. |
| **Team review requests are not mine** | Turns off [`teamReviewsAreMine`](/docs/settings#teamreviewsaremine): team requests wait on the team, in Waiting.                                 |
| **It is a bot's PR**                  | Turns on [`botsAreUpdates`](/docs/settings#botsareupdates).                                                                                      |
| **I don't work on acme/website**      | Adds a [rule](/docs/rules) at the top: `repo:acme/website` goes to Updates.                                                                      |
| **Only this one**                     | Moves only this item to Updates, **until it changes**. Then Hush places it again.                                                                |

Hush shows only the answers that would change something for this item. After each one, **Undo** in the message puts everything back.

**It is my turn** ({{key:item.myTurn}}) is the other way: it moves an item from Waiting or Updates to Your turn, until it changes.

## Hush finished these for you

When an item leaves Your turn by itself (you approved, you pushed a fix, CI passes now, it was merged), Hush says why. For a day, **Hush finished these for you** at the top of Your turn lists them, each with its note:

- ✓ You approved · ✓ You requested changes · ✓ You replied · ✓ You pushed changes
- ✓ CI passes now · ✓ Conflicts resolved · ✓ Threads resolved
- ✓ Merged · ✓ Closed · ✓ Review no longer requested · ✓ @alice reviewed

**Undo** next to one puts it back in Your turn, until it changes. The × hides the list. Nothing leaves Your turn with no trace.

## Done, Snooze, and Mute

Each action works on the row under the cursor, or on every selected row.

| Action        | Key                  | What it does                                                                                           |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| **Done**      | {{key:item.done}}    | Hides the item **until it is your turn again**. A change that stays in Updates does not bring it back. |
| **Snooze**    | {{key:item.snooze}}  | Hides it until a time, or until something happens. Opens the choices.                                  |
| **Mute**      | {{key:item.mute}}    | Hides it for good, and unsubscribes you on GitHub, so GitHub stops notifying you about it.             |
| **Move back** | {{key:item.restore}} | Undoes Done, Snooze, Mute, Not my turn, or It is my turn.                                              |

After each action, a message with **Undo** shows for a few seconds. Done, snoozed, and muted items are in [Search](/docs/search), under **Done**, **Snoozed**, and **Muted**.

**Done lasts until it is your turn again.** A PR that you marked Done comes back when its turn changes: someone requests your review again, CI fails again, someone replies to you. With **Keep GitHub in step** on, Done also marks the notification done on GitHub.

## Snooze

The Snooze choices are times and conditions. A time is on your computer's clock.

- For 1 hour, for 3 hours, until tomorrow 9:00, or until next Monday 9:00.
- **Until something happens**:

{{ref:snooze}}

A snooze “until” also ends after 7 days, so nothing sleeps forever. If the PR or issue is merged or closed first, the snooze ends at once, because the event can no longer happen. When a snooze ends because the thing happened, Hush pushes “Snooze over: CI passed”. Conditions that are already true are not offered.

A [rule](/docs/rules) can snooze items for a number of hours when they come into Your turn.

## Select many

- {{key:list.select}} selects or deselects the row under the cursor. {{key:list.extendNext}} and {{key:list.extendPrev}} extend the selection.
- ⌘-click (Ctrl-click) adds a row; Shift-click selects a range; {{key:list.selectAll}} selects all.
- With a selection, a bar at the bottom has Done, Snooze, and Mute. The keys and the right-click menu act on all selected rows.
- {{key:list.escape}} clears the selection.

## Right-click menu

Right-click a row (or choose “⋯” on a phone) for every action: Peek, the main action, Open on GitHub, Done, Snooze, Mute, Not my turn, It is my turn, Move back, Copy link, **Make a rule…**, and selection. With a selection, the menu acts on all selected rows. You can change the items and their order: see [Menus](/docs/appearance-and-menus#menus).

**Make a rule…** opens **Settings → Advanced** with a new rule for this item's repository and type.

## Sync

Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)), and open tabs update at once when something changes. The top of each lane says “Synced 2m ago”, or “Syncing…” while a check runs.

To check now, press {{key:list.refresh}} or choose the refresh button. This also looks again at up to 40 items in Your turn, and moves the ones that are no longer your turn.
