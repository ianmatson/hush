---
title: Where Hush looks
description: The GitHub searches that find items with no recent notification, the scope, and your teams.
---

Your notifications are only part of what involves you. An old review request, your open PR, or an issue assigned to you months ago may have no recent notification. So besides your notifications, Hush runs a few **tracked searches** on GitHub every 15 minutes, and first of all when you sign in.

A tracked search only **finds** items. Where an item goes still depends on whose turn it is: your open PR that waits for review is in Waiting, and the same PR with failing CI is in Your turn.

## Tracked searches

Change them in **Settings → Advanced → Where Hush looks**:

- Each search has a name and a [GitHub search](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests). `@me` is you. `@team` runs the search once for each team that you track.
- Turn a search off with its switch, move it up or down, delete it, or choose **Add search**. The link button opens the same search on GitHub, to check it.
- **Defaults** puts back the default searches. Nothing changes until you choose **Save**.

The defaults:

{{ref:searches}}

In settings.json, they are [`searches`](/docs/settings#searches).

## Scope

**Scope** is added to every search. Use it to keep Hush to your work: `org:acme`, `org:acme archived:false`, or `-repo:acme/website`. It is [`searchScope`](/docs/settings#searchscope) in settings.json.

## Teams

**Teams** lists the teams that GitHub says you are in. Your teams matter in two places:

- A review request to a team that you track is **Waiting on the team**, or **Your turn** with **Review requests to my teams are my turn** on ([`teamReviewsAreMine`](/docs/settings#teamreviewsaremine)).
- `@team` searches run once for each team that you track.

Turn off big teams (such as “everyone”) to cut noise: their review requests then do not count at all. **Look up teams again** finds new teams at once; otherwise Hush looks every 6 hours. In settings.json, the teams that you turned off are [`excludedTeams`](/docs/settings#excludedteams).

One pass runs up to 40 GitHub searches. When a search fails, the message says which one; if GitHub needs more access for it (for example an org that has not approved Hush), see [GitHub access](/docs/github-access).
