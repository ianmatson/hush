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

| Setting                                                             | Default | Pushes                                                                                                  |
| ------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| **“Needs you” items** ([`pushAction`](/docs/settings#pushaction))   | on      | Review requests, failed CI on your PRs, replies, direct mentions: everything that arrives in Needs you. |
| **FYI items** ([`pushFyi`](/docs/settings#pushfyi))                 | off     | FYI threads too. Usually noisy.                                                                         |
| [`pushTurnChanges`](/docs/settings#pushturnchanges) (settings.json) | on      | A thread that becomes your turn with no new notification, for example new commits after your review.    |

[Rules](/docs/rules) decide for the threads they match: `"push": true` pushes even FYI threads, and `"push": false` stops the push even for Needs you. This is the best way to hear about one repository or one person.

Hush checks GitHub every 5 minutes while push is on, so an alert can come a few minutes after the event. When more than 3 threads arrive in one check, they come as one push: “5 things need you”.

A push opens the thread's main action (the PR's files to review, its checks…). An alert stays until you close it: Done, Mute, or Snooze in Hush does not change it. (A browser must show something for each push, so Hush cannot remove an alert without showing a new one.)

## Quiet hours

No pushes at the times that you choose. Turn on **Quiet hours** in **Settings → Notifications**, and set **From** and **to**. **All weekend** also makes Saturday and Sunday quiet.

- A time range such as 22:00 to 07:00 ends the next morning.
- The times are in one time zone, shown under the times. If you travel, choose **Use** with your current time zone.
- During quiet hours, alerts still go in the alert history. When quiet hours end, **one push** lists what waited: “4 alerts while quiet”.

In settings.json this is [`quietHours`](/docs/settings#quiethours).

## Alert history

The bell in the header lists every push alert from the last 30 days, newest first, also those that waited during quiet hours. Click an alert to peek at its thread, or open it on GitHub. An alert shows what happened to its thread since: Done, Muted, Snoozed, or the note such as “You approved”.

## Tab title and icon

**Settings → General → Tab title & icon** puts a count on the browser tab and on the app icon. These settings are in this browser only.

- **Count in the page title**: “(3) Hush”. **Format** is a total, or a breakdown such as “(7 · 3 PR · 2 issue)”.
- **Dot on the tab icon**: a colored dot, with the number or only a dot. Safari may ignore icon changes after the page loads.
- **Badge on the app icon**: only when Hush is installed as an app (Chrome, Edge, Safari on macOS).

For each one, **Count** picks what counts: unread alerts (the default), Inbox: Needs you, Inbox: FYI, Pull requests: your turn, Pull requests: your team's turn, and Issues: your turn. Nothing is added when the count is 0.
