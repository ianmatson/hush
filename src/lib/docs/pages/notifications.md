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

Hush pushes **only what comes into Your turn**: a review request, a reply to you, CI that fails on your PR, a PR that is ready to merge. Also when nothing sent a notification, for example new commits after your review. Waiting and Updates never push. Each item pushes once for each change of its turn, so a PR that stays your turn does not push again.

| In **Settings → Notifications**                                                         | Default | Does                                                                       |
| --------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| **When something becomes your turn** ([`push`](/docs/settings#push))                    | on      | Pushes items that come into Your turn.                                     |
| **Update an alert when it is resolved** ([`pushResolved`](/docs/settings#pushresolved)) | on      | Replaces a recent alert with a quiet “✓ You approved” when it is resolved. |

[Rules](/docs/rules) decide for the items they match: `"push": false` stops the push, and `"push": true` pushes even with the setting off. To hear about something that is not your turn (the releases of one repository, everything from one person), make a rule that puts it in Your turn: `"lane": "turn"`.

Hush checks GitHub every 5 minutes while push is on, so an alert can come a few minutes after the event. When more than 3 items come into Your turn in one check, they come as one push: “5 things are your turn”.

A push opens the item's main action (the PR's files to review, its checks…). When you finish an item on one device (Done, Mute, Snooze, or when Hush sees that you approved), its alert on your other devices changes to a quiet note and closes.

## Quiet hours

No pushes at the times that you choose. Turn on **Quiet hours** in **Settings → Notifications**, and set **From** and **to**. **All weekend** also makes Saturday and Sunday quiet.

- A time range such as 22:00 to 07:00 ends the next morning.
- The times are in one time zone, shown under the times. If you travel, choose **Use** and your current time zone.
- During quiet hours, alerts still go in the alert history. When quiet hours end, **one push** lists what waited: “4 alerts while quiet”.

In settings.json this is [`quietHours`](/docs/settings#quiethours).

## Alert history

The bell in the header lists every push alert from the last 30 days, newest first, also those that waited during quiet hours. Click an alert to peek at its item, or open it on GitHub. An alert shows what happened to its item since: Done, Muted, Snoozed, or the note such as “You approved”.

## Tab title and icon

**Settings → Account → Appearance → Tab title & icon** puts a count on the browser tab and on the app icon. These settings are in this browser only.

- **Count in the page title**: “(3) Hush”. **Format** is a total, or a breakdown such as “(7 · 3 waiting)”.
- **Dot on the tab icon**: a colored dot, with the number or only a dot. Safari may ignore icon changes after the page loads.
- **Badge on the app icon**: only when Hush is installed as an app (Chrome, Edge, Safari on macOS).

For each one, **Count** picks what counts: Your turn (the default), Waiting, and unread alerts. Nothing is added when the count is 0.
