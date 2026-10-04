---
title: Whose turn
description: How Hush decides that a pull request or issue is your turn, what changed since you looked, and what to do when Hush is wrong.
---

Hush reads each pull request and issue that it tracks (CI, reviews, comments, conflicts), and decides whose turn it is. The [Pull requests and Issues tabs](/docs/pull-requests-and-issues) group items by turn, and Hush pushes only what is your turn (see [Notifications](/docs/notifications)).

## What is your turn

An item is in **Your turn** when one of these is true:

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

With [smart decisions](/docs/settings#smartdecisions) on, Hush also reads the newest comments. When they need nothing from you (thanks, approval, a status update, +1), a reply or a mention is not your turn.

With [`botsAreFyi`](/docs/settings#botsarefyi) on (the default), PRs, comments, and mentions by bots are not your turn. A review request to you by name is still your turn, also on a bot's PR.

Turn these settings on or off in **Settings → Turns & Jev**.

## Your team's turn

A review request to a team that you are in shows under **Your team's turn** on the Pull requests tab. With [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction) on, it is your turn, and it can push. Turn off big teams, such as “everyone”, in **Settings → Sources** (see [`dash.excludedTeams`](/docs/settings#dash-excludedteams)).

[`reviewResolution`](/docs/settings#reviewresolution) decides when a review request stops being your turn: when GitHub no longer asks you, or also when someone else reviews.

## Since you looked

Hush remembers what a pull request or issue looked like when you last looked at it: when it stays open in the peek for a moment, or when you open it on GitHub from Hush. After that, its row and its peek list what changed since then:

- New commits, new comments, and new reviews (“@alice approved”, “@bob requested changes”).
- CI: “CI fails”, “CI passes now”, “CI running”.
- Your review requested again; merged, closed, or reopened; ready for review or back to draft; new labels.

Before your first look, nothing is listed. Your own changes do not count.

## Not my turn

When Hush puts an item in **Your turn** and it is not your turn, press {{key:dash.notNeeded}}, or choose **Not my turn** at the top of the [peek](/docs/peek) or in the right-click menu. Hush asks why, and each answer fixes what would have been right:

| Answer                                 | What changes                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Someone else already reviewed it**   | Sets [`reviewResolution`](/docs/settings#reviewresolution) to `"any_review"`: a review by someone else settles a review request. |
| **Team review requests don't need me** | Turns off [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction).                                                         |
| **A bot opened it**                    | Turns on [`botsAreFyi`](/docs/settings#botsarefyi).                                                                              |
| **Only this one**                      | Moves only this item to Other, until it changes on GitHub.                                                                       |

Hush shows only the answers that would change something for this item. After each one, **Undo** in the message puts everything back.

To move an item to any group by hand, see [Move an item to another group](/docs/pull-requests-and-issues#move-an-item-to-another-group).
