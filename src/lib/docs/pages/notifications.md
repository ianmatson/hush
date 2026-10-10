---
title: Notifications
description: Push alerts on your devices, alerts in Slack, what gets pushed, quiet hours, the alert history, and counts on the tab.
---

## Turn on push

Hush sends native push notifications, also when Hush is closed. Push is per device: turn it on in each browser or installed app that should get alerts.

1. Go to **Settings → Notifications**.
2. Under **Devices**, choose **Turn on**. The browser asks for permission.
3. Choose **Send test** to check it.

The list under **Devices** has every device that gets push, with “(this device)” next to this one. The trash button removes a device. Up to 10 devices can get push.

**iPhone and iPad:** push works only in an installed web app (iOS 16.4 or later). Open Hush in Safari, choose Share → **Add to Home Screen**, open Hush from the Home Screen, and turn on push there.

## Slack

Hush can send your alerts as Slack direct messages from the **Hush** app, as well as push or in place of push. Each message has the alert and an **Open in Hush** button. A digest is one message with a list.

1. Go to **Settings → Notifications**.
2. Under **Slack**, choose **Connect Slack**.
3. Slack asks you to choose a workspace and to allow Hush to send you messages. Your workspace admin may need to approve the app first.
4. Choose **Send test** to check it.

When Slack is connected, two switches control where alerts go:

- **Alerts in Slack** ([`alertChannels.slack`](/docs/settings#alertchannels-slack)): on by default.
- **Push to devices too** ([`alertChannels.push`](/docs/settings#alertchannels-push)): on by default. Turn it off to get alerts only in Slack.

Everything on this page applies to Slack as it does to push: what gets pushed, quiet hours, digests, limits, and **Push while Hush is open**. The Hush app can only send you direct messages. It cannot read your messages or channels.

**Disconnect** stops Slack alerts for you. To remove Hush from the whole workspace, a workspace admin removes the app in Slack; Hush then deletes what it stored for that workspace. See [Privacy](/privacy#slack) for what Hush stores.

## What gets pushed

Hush pushes facts, not guesses. Each time Hush reads a pull request or issue from GitHub, it compares it with the last read. When one of the facts that you turned on became true, it pushes. Choose the facts in **Settings → Notifications → What to push** ([`pushFacts`](/docs/settings#pushfacts)):

| Fact                                       | Default | Pushes when                                                                                |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------ |
| Your review is requested                   | on      | Someone requests your review by name, also again after your review.                        |
| Your team's review is requested            | off     | Someone requests the review of a team that you track (Settings → Views → Teams).           |
| You are mentioned                          | on      | Someone writes @you or @your-team.                                                         |
| Someone replies                            | on      | Someone comments on your pull request or issue, or comments right after your comment.      |
| Your pull request is approved              | on      | Someone approves your pull request.                                                        |
| Changes are requested on your pull request | on      | Someone requests changes on your pull request.                                             |
| CI fails on your pull request              | on      | The checks of your pull request start to fail.                                             |
| CI passes on your pull request             | off     | The checks of your pull request pass.                                                      |
| You are assigned                           | on      | Someone assigns you to a pull request or an issue.                                         |
| A snooze ends                              | on      | The thing that you [snoozed](/docs/pull-requests-and-issues#snooze) an item until happens. |

- Your own actions never push. Comments by bots never push.
- A muted item never pushes. An item that you snoozed until a time or until something happens pushes only when its snooze ends.
- The first time Hush reads an item, it pushes only for events of the last hour.
- **Push new items**: each view also has its own switch, in **Settings → Views**. With it on, Hush pushes when a pull request or issue shows up in that view for the first time. Items that you opened do not push. When you change a view's searches, the items that it finds then do not push.

To get fewer pushes, turn off facts, [mute](/docs/pull-requests-and-issues#snooze) items that you do not want to hear about, or use the digest and the limit below.

Hush checks GitHub every 5 minutes while push is on, so an alert can come a few minutes after the event. When more than 3 items arrive in one check, they come as one push: “5 alerts”.

A push opens its pull request or issue on GitHub. A push that lists many alerts opens Hush. Pushes have no buttons: to snooze or mute the item, open it in Hush.

## How often

Busy PRs change many times a day. These settings, in **Settings → Notifications → How often**, keep that from buzzing your phone each time.

- **One alert for each PR or issue.** All its facts (a review request, a CI failure, a reply) share one alert, and a later push replaces it.
- **Push the same item again** ([`pushRepeat`](/docs/settings#pushrepeat)): by default, an item pushes once, and then not again until you open Hush, read it on GitHub, or act on it. **Again when the reason changes** also pushes when, for example, “Review requested” becomes “Changes requested”. **Each update** pushes every time. A snooze that ends always pushes.
- **Digest** ([`pushDigestMinutes`](/docs/settings#pushdigestminutes)): pushes wait, and one push lists them every 5 to 240 minutes.
- **Limit** ([`pushLimit`](/docs/settings#pushlimit)): after this many pushes in this many minutes, the rest wait and go as one push.
- **Push blocking items at once** ([`pushUrgentNow`](/docs/settings#pushurgentnow)): off by default, and it needs [smart decisions](/docs/settings#smartdecisions) (on by default). A push about an item whose text says it blocks something or is about an incident skips the digest and the limit. Quiet hours still hold it.
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

The bell in the header lists every push alert from the last 30 days, newest first, also those that waited during quiet hours. A dot marks the alerts that are new since you last opened the list.

- Click an alert about a pull request or issue to read it in a [peek](/docs/peek), in the same panel. The button at the top right opens it on GitHub, and **Alerts** goes back to the list.
- Other alerts, such as a digest, open where the push went.

## Tab title and icon

**Settings → General → Tab title & icon** puts a count on the browser tab and on the app icon. These settings are in this browser only.

- **Count in the page title**: “(3) Hush”. **Format** is a total, or a breakdown such as “(7 · 3 PR · 2 issue)”.
- **Dot on the tab icon**: a colored dot, with the number or only a dot. Safari may ignore icon changes after the page loads.
- **Badge on the app icon**: only when Hush is installed as an app (Chrome, Edge, Safari on macOS).

For each one, **Count** picks what counts: unread alerts (the default), unread pull requests and issues, Pull requests: your turn, Pull requests: your team's turn, and Issues: your turn. Nothing is added when the count is 0.
