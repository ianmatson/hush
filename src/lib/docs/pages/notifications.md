---
title: Notifications
description: Push alerts on your devices, what gets pushed, quiet hours, the alert history, and counts on the tab.
---

## Turn on push

Hush sends native push notifications, also when Hush is closed. Push is per device: turn it on in each browser or installed app that should get alerts.

1. Go to **Settings → Notifications**.
2. Under **Devices**, choose **Turn on**. The browser asks for permission.
3. Choose **Send test** to check it.

The list under **Devices** has every device that gets push, with “(this device)” next to this one. The trash button removes a device. Up to 10 devices can get push.

**iPhone and iPad:** push works only in an installed web app (iOS 16.4 or later). Open Hush in Safari, choose Share → **Add to Home Screen**, open Hush from the Home Screen, and turn on push there.

## What gets pushed

| Setting                                                             | Default | Pushes                                                                                                              |
| ------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| **“Needs you” items** ([`pushAction`](/docs/settings#pushaction))   | on      | Review requests, failed CI on your PRs, replies, direct mentions: everything that becomes [your turn](/docs/turns). |
| **FYI items** ([`pushFyi`](/docs/settings#pushfyi))                 | off     | Items that are not your turn too. Usually noisy.                                                                    |
| [`pushTurnChanges`](/docs/settings#pushturnchanges) (settings.json) | on      | A thread that becomes your turn with no new notification, for example new commits after your review.                |

Each [category](/docs/settings#categories) can change this for its items: `"push": "on"` pushes its items that need you, also when these settings would not, and `"push": "off"` never pushes them. Set it in **Settings → Categories & tags**. This is the best way to hear about one repository, or to silence one:

```json settings
{
	"categories": [
		{
			"id": "web",
			"name": "Web",
			"color": "blue",
			"rule": "repo:acme/web",
			"description": "",
			"push": "on"
		},
		{
			"id": "bots",
			"name": "Bots",
			"color": "gray",
			"rule": "author:bots",
			"description": "",
			"push": "off"
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	]
}
```

A change to `categories` replaces the whole list, so keep `"other"`: it is the fallback.

Hush checks GitHub every 5 minutes while push is on, so an alert can come a few minutes after the event. When more than 3 items arrive in one check, they come as one push: “5 things need you”.

A push opens the item's main action (the PR's files to review, its checks…). In Chrome, Edge, and on Android, the alert also has **Done** and **Snooze 3h** buttons, which act on the item's threads without opening Hush. If the action fails, Hush opens the item. Other browsers do not show buttons on alerts.

## How often

Busy PRs change many times a day. These settings, in **Settings → Notifications → How often**, keep that from buzzing your phone each time.

- **One alert for each PR or issue.** All its threads (a review request, a CI failure, a reply) share one alert, and a later push replaces it.
- **Push the same item again** ([`pushRepeat`](/docs/settings#pushrepeat)): by default, an item pushes once, and then not again until you open Hush, read it on GitHub, or act on it. **Again when the reason changes** also pushes when, for example, “Review requested” becomes “Changes requested”. **Each update** pushes every time. A snooze that ends always pushes.
- **Digest** ([`pushDigestMinutes`](/docs/settings#pushdigestminutes)): pushes wait, and one push lists them every 5 to 240 minutes.
- **Limit** ([`pushLimit`](/docs/settings#pushlimit)): after this many pushes in this many minutes, the rest wait and go as one push.
- **Push blocking items at once** ([`pushUrgentNow`](/docs/settings#pushurgentnow)): off by default, and it needs [smart decisions](/docs/settings#smartdecisions). A “Needs you” item whose text says it blocks something or is about an incident skips the digest and the limit. Quiet hours still hold it.
- **Per category** ([`categories`](/docs/settings#categories), `push`): in **Settings → Categories & tags**, each category can use these settings, push what needs you, or never push. The bell lists every notification either way.
- **Push while Hush is open** ([`pushWhileOpen`](/docs/settings#pushwhileopen)): off by default. While you use Hush on any device, new items show in Hush and do not push. They still go in the [alert history](#alert-history). Hush is in use when its tab or app has focus and you used it in the last 5 minutes.
- **Clear notifications** ([`clearNotifications`](/docs/settings#clearnotifications)): by default, Hush removes its alerts from a device when you open Hush there. **Each one, when you open its item** removes only the alert of the item that you peek at.

A browser must show something for each push, so Hush cannot remove an alert from another device. iPhone and iPad can show a new alert in place of a replaced one, and can keep alerts that Hush asks to remove.

## Quiet hours

No pushes at the times that you choose. Turn on **Quiet hours** in **Settings → Notifications**, and set **From** and **to**. **All weekend** also makes Saturday and Sunday quiet.

- A time range such as 22:00 to 07:00 ends the next morning.
- The times are in one time zone, shown under the times. If you travel, choose **Use** with your current time zone.
- During quiet hours, alerts still go in the alert history. When quiet hours end, **one push** lists what waited: “4 alerts while quiet”.

In settings.json this is [`quietHours`](/docs/settings#quiethours).

## Alert history

The bell in the header opens **Notifications**: every alert about your pull requests and issues from the last 30 days, newest first, also those that waited during quiet hours. Click an alert to peek at its item, or open it on GitHub. An alert shows what happened to its thread since: Done, Muted, Snoozed, or the note such as “You approved”.

## Tab title and icon

**Settings → General → Tab title & icon** puts a count on the browser tab and on the app icon. These settings are in this browser only.

- **Count in the page title**: “(3) Hush”. **Format** is a total, or a breakdown such as “(7 · 3 PR · 2 issue)”.
- **Dot on the tab icon**: a colored dot, with the number or only a dot. Safari may ignore icon changes after the page loads.
- **Badge on the app icon**: only when Hush is installed as an app (Chrome, Edge, Safari on macOS).

For each one, **Count** picks what counts: unread alerts (the default), Inbox: Needs you, Inbox: FYI, Pull requests: your turn, Pull requests: your team's turn, and Issues: your turn. Nothing is added when the count is 0.
