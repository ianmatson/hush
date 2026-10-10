---
title: How to see only the GitHub review requests that need you
description: Find the pull requests that wait for your review with review-requested:@me and user-review-requested:@me, cut team and CODEOWNERS noise, and keep a list that empties when you review.
---

## Short answer

**Search GitHub for `is:pr is:open user-review-requested:@me` to see only the pull requests where someone asked you by name. `review-requested:@me` also includes requests to your teams. To cut team and CODEOWNERS noise, a team maintainer can turn on "Only notify requested team members" or auto assignment in the team's code review settings.**

## Step 1: Search for your review requests

Type one of these searches in the pull requests dashboard at [github.com/pulls](https://github.com/pulls), or in the search box on any page:

| Search                                         | Finds                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `is:pr is:open user-review-requested:@me`      | Pull requests where someone asked **you** by name.                             |
| `is:pr is:open review-requested:@me`           | Requests to you, and to the teams that you are in.                             |
| `is:pr is:open team-review-requested-user:@me` | Requests to a team that you are in.                                            |
| `is:pr is:open team-review-requested:acme/web` | Requests to one team.                                                          |
| `is:pr is:open review-involves:@me`            | Every pull request that you were asked to review, also after someone approved. |

GitHub removes you from the requested reviewers when you review, so the pull request leaves the `review-requested` results. If the author asks you again, it comes back.

Add these words to make the list shorter:

- `draft:false` leaves out draft pull requests.
- `archived:false` leaves out archived repositories.
- `-author:app/dependabot` leaves out Dependabot's pull requests.
- `org:acme` keeps one organization.

Since July 2026, the dashboard at github.com/pulls also has an **Inbox** with your review requests, and **saved views**. Save your search as a view, so it is one click away.

## Step 2: Filter your notifications

In the notifications inbox, the default **Review requested** filter, or `reason:review-requested`, shows review requests to you and to your teams.

The reason does not change after you review. A notification with `reason:review-requested` stays in that filter until you mark it **Done** (`E`). So this filter shows what GitHub asked of you, not what still waits on you. For the second list, use the search in step 1.

## Step 3: Cut team and CODEOWNERS noise

When a `CODEOWNERS` file names a team, GitHub requests a review from that team on each pull request that changes its files. Every member gets the request. Code owners are not requested on draft pull requests.

A team maintainer can change this in the team's settings: **Organization → Teams → the team → Settings → Code review**.

- **Only notify requested team members**: when the author also asks one member of the team by name, GitHub does not notify the whole team.
- **Enable auto assignment**: GitHub removes the team and requests some of its members in its place, with a **Round robin** or a **Load balance** routing algorithm. Members whose status is "Busy" are skipped.

If a branch protection rule requires a review from code owners, the team request stays, and the members are requested too.

Also check the `CODEOWNERS` file: a wide pattern such as `*` with a large team sends that team every pull request.

## When GitHub is enough

If you review for one or two teams, a saved view with `user-review-requested:@me` plus the code review settings above is often all you need.

## Where Hush helps

GitHub's searches know who was asked. They do not know if the request still waits on you: if the author pushed new commits since your review, or if someone else already reviewed. Hush looks at the reviews, commits, and CI of each pull request, and puts a review request in **Needs you** when it is your turn:

- Your review is requested from you by name, or again after your review.
- New commits arrived since your review.
- The pull request is assigned to you.

When you approve or request changes, Hush moves the thread to **Done** by itself. See [what needs you](/docs/inbox#what-needs-you).

Team requests are **FYI** by default. In a view grouped by **Your role**, they are under **Reviews**, with “Review for acme/web” on the row (see [Group by](/docs/pull-requests-and-issues#group-by)). You can change this:

- [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction): team review requests go to Needs you, and push.
- [`reviewResolution`](/docs/settings#reviewresolution) `"any_review"`: a review by someone else settles a request. Use it on teams where one review is enough.
- [`dash.excludedTeams`](/docs/settings#dash-excludedteams): leave out big teams, such as "everyone".

A [view](/docs/views) with only your review requests, next to the default Mine view, and the settings above:

```json settings
{
	"teamReviewsAreAction": false,
	"reviewResolution": "any_review",
	"dash": { "excludedTeams": ["acme/everyone"] },
	"views": [
		{
			"id": "mine",
			"name": "Mine",
			"searches": ["is:open involves:@me", "is:pr is:open reviewed-by:@me -author:@me"],
			"groupBy": "role"
		},
		{
			"id": "reviews",
			"name": "Reviews",
			"searches": ["is:pr is:open user-review-requested:@me"],
			"groupBy": "status"
		}
	]
}
```

To read the pull request and approve it without leaving Hush, use the [peek](/docs/peek). For the diff and line comments, Hush sends you to GitHub.

## Sources

- [Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests), GitHub Docs
- [New pull requests dashboard is now generally available](https://github.blog/changelog/2026-07-09-new-pull-requests-dashboard-is-now-generally-available/), GitHub Changelog, 9 July 2026
- [Inbox filters](https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters), GitHub Docs
- [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), GitHub Docs
- [Managing code review settings for your team](https://docs.github.com/en/organizations/organizing-members-into-teams/managing-code-review-settings-for-your-team), GitHub Docs

_Last checked: 3 October 2026._
