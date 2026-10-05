---
title: How to get push notifications for GitHub review requests and CI failures on your phone
description: GitHub Mobile pushes review requests, mentions, assignments, and failed runs that you started. Hush pushes what waits on you from any browser, including CI that fails on your pull requests. How to set up both, also on iPhone.
---

## Short answer

**Install GitHub Mobile, and turn on push for review requests and for GitHub Actions, with "failed workflows only". GitHub then pushes review requests to you, and workflow runs that you started when they fail. To get one push for each pull request, only when it is your turn, use a web app such as Hush. On iPhone, first add it to the Home Screen (iOS 16.4 or later), then turn on push.**

## Option 1: GitHub Mobile

GitHub Mobile is GitHub's own app for iOS and Android. It is free, and its pushes come at once.

1. Install GitHub Mobile and sign in.
2. Tap **Profile**, then the settings button.
3. Tap **Notifications** (iOS) or **Configure Notifications** (Android).
4. Turn on the pushes that you want:
   - Direct mentions
   - Assignments to issues or pull requests
   - Requests to review a pull request
   - Requests to approve a deployment
   - GitHub Actions workflow runs. You can choose failed runs only.
5. Optional: tap **Working Hours** and turn on **Custom working hours**, so pushes come only at the times that you choose.

Know what GitHub Mobile does not push:

- **Workflow runs that someone else started.** GitHub notifies the person who triggered a run. A scheduled workflow notifies the person who created its schedule, or who changed it last.
- **Changes that send no notification**, such as new commits after your review.

## Option 2: Hush (web push)

Hush sends standard Web Push to browsers and installed web apps. It pushes only what arrives in **Needs you**: review requests to you, failed CI on your pull requests, replies to you, and direct mentions. Hush reads the checks of your pull request, so it does not matter who started the run.

### On a computer or Android

1. Open [app.hush-gh.com](https://app.hush-gh.com) and sign in with GitHub.
2. Go to **Settings → Notifications**.
3. Under **Devices**, choose **Turn on**, and allow notifications when the browser asks.
4. Choose **Send test**.

In Chrome, Edge, and on Android, each alert has **Done** and **Snooze 3h** buttons.

### On iPhone or iPad

On iOS and iPadOS, web push works only in a web app on the Home Screen (iOS 16.4 or later).

1. Open [app.hush-gh.com](https://app.hush-gh.com) in Safari, and sign in.
2. Tap **Share**, then **Add to Home Screen**.
3. Open Hush from the **Home Screen** icon, not from Safari.
4. Go to **Settings → Notifications** and choose **Turn on**. iOS asks for permission.
5. Choose **Send test**.

Do the steps on each device that should get pushes. Up to 10 devices can get push. See [Notifications](/docs/notifications).

### Make it push less

Busy pull requests change many times a day. By default, Hush keeps **one alert for each pull request or issue**, and pushes it once until you open Hush or act on it. You can change this, and add quiet hours and a limit:

```json settings
{
	"pushRepeat": "reason",
	"quietHours": { "from": 1320, "to": 420, "weekends": true, "timeZone": "Europe/London" },
	"pushLimit": { "count": 6, "minutes": 30 }
}
```

- [`pushRepeat`](/docs/settings#pushrepeat) `"reason"` pushes again when the reason changes, for example from "Review requested" to "Changes requested".
- [`quietHours`](/docs/settings#quiethours) holds pushes from 22:00 to 07:00 and on weekends. When quiet hours end, one push lists what waited.
- [`pushLimit`](/docs/settings#pushlimit) sends at most 6 pushes in 30 minutes. The rest wait and go as one push.

A [category](/docs/categories#inbox-settings) decides for its threads: **Always push** or **Never push**. This one pushes every notification about the issues of one project, also FYI ones:

```json settings
{
	"categories": [
		{
			"id": "svelte",
			"name": "Svelte issues",
			"color": "orange",
			"rule": "type:issue repo:sveltejs/*",
			"description": "",
			"inbox": "fyi",
			"push": "on"
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	]
}
```

## Which one to choose

- **GitHub Mobile** is native, free, and fast. It also lets you read the diff and review on your phone. It pushes events, by type.
- **Hush** checks GitHub every 5 minutes, so a push can come a few minutes late. It pushes by whose turn it is: CI that fails on your pull request, new commits after your review, a reply to you. It has no native app and no diff view.

You can use both. See [Hush vs. GitHub notifications](/compare/github-notifications). For alerts on a desktop only, see [Gitify](/compare/gitify) and [Neat](/compare/neat).

## Sources

- [Configuring notifications](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications) (GitHub Mobile push), GitHub Docs
- [Push Notifications for Actions on Mobile](https://github.blog/changelog/2023-01-17-push-notifications-for-actions-on-mobile/), GitHub Changelog, 17 January 2023
- [Notifications for workflow runs](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs), GitHub Docs
- [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), WebKit blog, 16 February 2023

_Last checked: 3 October 2026._
