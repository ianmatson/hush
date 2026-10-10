---
title: How to reduce GitHub notification noise
description: Too many GitHub notifications? Unwatch busy repositories, turn off automatic watching, filter the inbox, and route email with GitHub's own settings. Then sort what is left by whose turn it is.
---

## Short answer

**To get fewer GitHub notifications, unwatch the repositories that you only read, turn off automatic watching, and filter your inbox by reason, for example `reason:review-requested` or `reason:mention`. If the list is still too long, a tool such as Hush can sort what is left by who must act next.**

GitHub's own settings are free and remove the most noise. Do them first.

## Why you get so many notifications

GitHub subscribes you to a thread when you open it, comment on it, are assigned to it, are mentioned, or change its state, and when a team you are in is mentioned. It also sends you everything in each repository that you **watch**. Automatic watching for repositories and teams is on by default, so your list of watched repositories grows with no step from you.

So most noise comes from two places: repositories that you watch but only read, and old threads that you once commented on.

## Step 1: Unwatch the repositories that you only read

1. Go to [github.com/watching](https://github.com/watching). It lists every repository that you watch.
2. For each repository that you do not work in every day, open the **Watch** menu and choose one of these:
   - **Participating and @mentions**: only threads that you are in, or where someone mentions you.
   - **Custom**: also the events that you choose, such as **Releases** or **Security alerts**.
   - **Ignore**: nothing at all, also no mentions. GitHub does not recommend this one.
3. To unwatch many at once, use **Unwatch all** and choose an organization. GitHub shows this button only when you watch more than 10 repositories.

## Step 2: Turn off automatic watching

1. Open [Notification settings](https://github.com/settings/notifications).
2. Turn off automatic watching for repositories and for teams.

Now a new repository or a new team does not fill your inbox. You still get notifications for threads that you are in.

## Step 3: Choose where each kind of notification goes

On the same settings page:

- **Participating, @mentions and custom**: keep **On GitHub**. Turn on **Email** only if you read GitHub in your mail.
- **Watching**: **On GitHub** only, or off. Email for every watched repository is the largest source of noise.
- **Actions** (under **System**): choose **On GitHub** or **Email**, then **Only notify for failed workflows**. GitHub then tells you about failed runs only, not each passing run.

Keep **On GitHub** on for at least one of Participating and Watching. If both are off, the inbox at github.com/notifications gets no updates.

If you get GitHub email for work and for open source, open **Custom routing** under **Default notifications email** and send each organization to its own address.

## Step 4: Filter the inbox

The inbox at [github.com/notifications](https://github.com/notifications) has default filters for threads where you are assigned, participating, mentioned, or requested to review, and where your team is mentioned. You can save up to 15 custom filters of your own. Useful ones:

| Filter                               | Shows                                                 |
| ------------------------------------ | ----------------------------------------------------- |
| `reason:review-requested`            | Review requests to you, or to a team you are in.      |
| `reason:mention`                     | Only direct @mentions of you.                         |
| `reason:author`                      | Activity on pull requests and issues that you opened. |
| `repo:acme/web reason:participating` | Threads that you are in, in one repository.           |
| `org:acme is:unread`                 | Unread notifications from one organization.           |
| `is:check-suite`                     | Workflow runs.                                        |

Know the limits of these filters: they cannot search titles, they cannot leave things out (no `-` or `NOT`), and `is:issue` and `is:pr` both return issues and pull requests.

## Step 5: Clear threads as you go

- **Done** (key `E`) removes a notification from the inbox. New activity brings it back.
- **Unsubscribe** (key `Shift`+`M`) removes it and stops notifications for that thread, until someone mentions you or your team, or requests your review.

Unsubscribe from long threads that you commented on once. This is often the fastest way to get a smaller inbox.

## When GitHub's settings are enough

If you work in a few repositories and the steps above leave a short list, you do not need another tool. GitHub's inbox is free, built in, and has native mobile apps. See [Hush vs. GitHub notifications](/compare/github-notifications) for a full comparison.

## Where Hush helps

GitHub sorts notifications by time, and gives each one a reason that does not change. A thread with `reason:review-requested` keeps that reason after you review. Hush reads the same notifications, then looks at the pull request or issue behind each one: its CI, reviews, review requests, conflicts, and newest comment.

- **Needs you** has only the threads where you are the next person who must act: your review is requested, CI fails on your PR, someone replied to you. Everything else goes to **FYI**. See [what needs you](/docs/inbox#what-needs-you).
- When you approve, push a fix, or reply, Hush moves the thread to **Done** by itself. If it needs you again, it comes back.
- When a thread is in Needs you and should not be, press {{key:inbox.notNeeded}} (**Doesn't need me**). Hush asks why, and changes a setting, or moves only this thread. See [Doesn't need me](/docs/inbox#doesnt-need-me).

Bots are FYI by default ([`botsAreFyi`](/docs/settings#botsarefyi)), and a review request to one of your teams is FYI unless you turn on [`teamReviewsAreAction`](/docs/settings#teamreviewsareaction):

```json settings
{ "botsAreFyi": true, "teamReviewsAreAction": false }
```

For one repository that you only read, choose **Mute** on its threads, or leave it out of your [views](/docs/views). [Categories](/docs/categories) sort your pull requests and issues, for example by effort, but they do not change the inbox.

Hush does not change what GitHub sends you, except **Mute**, which also unsubscribes you on GitHub. Hush keeps only the notifications about the pull requests and issues of your [views](/docs/views); it does not show releases, CI runs, or discussions. So the GitHub steps above still help: they leave Hush less to sort.

## Sources

- [About notifications](https://docs.github.com/en/subscriptions-and-notifications/concepts/about-notifications), GitHub Docs
- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications), GitHub Docs
- [Managing your subscriptions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-subscriptions-for-activity-on-github/managing-your-subscriptions), GitHub Docs
- [Managing GitHub Actions notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications), GitHub Docs
- [Managing organization notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-organization-notifications), GitHub Docs
- [Managing notifications from your inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox), GitHub Docs
- [Inbox filters](https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters), GitHub Docs
- [Keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts), GitHub Docs

_Last checked: 3 October 2026._
