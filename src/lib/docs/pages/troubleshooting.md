---
title: Troubleshooting
description: What to do when an item is missing, pushes do not arrive, or Hush shows an error.
---

## An org or a repository is missing

The org has probably not approved Hush. GitHub then hides the org completely. Check the list in **Settings → General → GitHub access**. If the org is not there, choose **Request approval**, and [use a custom token](/docs/github-access#custom-token) until an owner approves Hush.

If the org uses SAML single sign-on, and its items do not show in your views, sign in again and authorize Hush for that org.

## The inbox is gone

Hush no longer has an inbox, and it no longer sorts notifications into Needs you and FYI. An old `/inbox` link opens your start view. Hush now shows the pull requests and issues of your [views](/docs/views), and each row says whose turn it is. Your notifications on GitHub stay as they are: Hush only reads them.

## A pull request or issue is missing

Hush shows only the pull requests and issues that the searches of your views find. A GitHub notification about another item does not show in Hush.

- Check that one of your [views](/docs/views) finds the PR or issue. If none finds it, change a view's searches, or add a view that finds it, in **Settings → Views**.
- Views hide some items by default: drafts that others opened, and PRs and issues that bots or GitHub Apps opened. Turn them on in **Settings → Views → Filters**. See [`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts) and [`dash.hideBots`](/docs/settings#dash-hidebots).
- Hush does not show releases, CI and workflow runs, discussions, commits, security alerts, or invitations. Read them on GitHub.
- A new item can show a few minutes after GitHub notifies you: Hush runs the searches of your views again, at most every 5 minutes. Press {{key:list.refresh}} to search now.
- Snoozed and muted items do not show: press {{key:dash.showSnoozed}} to list them.

## “GitHub rejected the token”

The token no longer works: you revoked Hush on GitHub, the token expired, or a custom token was deleted. Sign in again. With a custom token, replace it in **Settings → General → GitHub access**.

## An item is in the wrong section

- Look at the row: its reason says whose turn it is, and why. See [whose turn it is](/docs/pull-requests-and-issues#whose-turn-it-is).
- Check the view's **Group by**: the sections come from it. See [Group by](/docs/pull-requests-and-issues#group-by).
- [Categories](/docs/categories) do not change whose turn it is.
- A pull request that a bot opened is not your turn, unless it asks for your review by name. A review request to one of your teams is your team's turn, not yours.
- If an item does not need you, snooze it ({{key:dash.snooze}}) until something new happens, or mute it ({{key:dash.mute}}).
- Press {{key:list.refresh}} to check GitHub again now.

## An item still says it is your turn

GitHub sends no notification for your own review, reply, or push. Hush sees them on the next search of your views, within about 15 minutes. Press {{key:list.refresh}} to check at once.

## Pushes do not arrive

1. In **Settings → Notifications**, check that this device says “Receives push notifications.”, and choose **Send test**.
2. Check that your system allows notifications from the browser, and that focus modes or Do Not Disturb are off.
3. Check [quiet hours](/docs/notifications#quiet-hours), and that the fact is one that pushes ([What gets pushed](/docs/notifications#what-gets-pushed)). Muted items never push.
4. Check [How often](/docs/notifications#how-often):
   - An item pushes once, and then not again until you open Hush or act on it ([`pushRepeat`](/docs/settings#pushrepeat)).
   - While Hush is open and in use on any device, it does not push ([`pushWhileOpen`](/docs/settings#pushwhileopen)).
   - A digest or a limit makes pushes wait.
5. On iPhone and iPad, push works only when Hush is on the Home Screen.
6. Turn push off and on again for the device.

Pushes can come a few minutes after the event: Hush checks GitHub every 5 minutes while push is on.

## Slack alerts do not arrive

1. In **Settings → Notifications → Slack**, check that Slack is connected and that **Alerts in Slack** is on. Choose **Send test**.
2. If Slack is not connected any more, connect it again. Hush removes the connection when the app is removed from the workspace, when its access is revoked, or when your Slack account is deactivated.
3. The other steps under [Pushes do not arrive](#pushes-do-not-arrive), from step 3, apply to Slack too.

## A view is empty or incomplete

- A view's searches are GitHub searches. Choose the link button next to a search in **Settings → Views** to try it on GitHub.
- Hush keeps the 100 most recently updated results of each search. Narrow a big search with `repo:`, `label:`, or `org:`.
- `@team` searches need your teams. If **Teams** says “GitHub reports no teams for you”, the token needs `read:org`, and SAML orgs must authorize it. Choose **Look up teams again** after you join a team.
- Snoozed and muted items: press {{key:dash.showSnoozed}} to show them.
- Drafts that others opened and PRs and issues that bots opened are hidden by default (**Settings → Views → Filters**): see [`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts) and [`dash.hideBots`](/docs/settings#dash-hidebots).

## An item is in the wrong category

- A category that you chose by hand wins. Right-click the item, choose the group's name, and then **Choose automatically** to remove your choice.
- The first category whose rule matches wins. Check the order in **Settings → Categories**.
- Jev chooses only among categories with a description, and only when a group has two or more of them. It reads an item again only when its title, description, or labels change, or when you change the descriptions of a group. Choose **Re-evaluate items** to ask again about every category.
- When Jev is off or cannot answer, and no rule matches, the item is Not sorted in that group: it has no category from the group.
- Rules cannot use `category:`.

## settings.json does not save

Hush shows the first error under the box, and saves nothing until the file is valid. The error names the setting, for example `"quietHours.timeZone is not a known time zone."`. `Unknown setting "botsAreFyi".`, `Unknown setting "rules".`, or a message like them means that the file has a setting that Hush no longer has. Remove it. Categories are in [`categoryGroups`](/docs/settings#categorygroups) now. The type and the allowed values of each setting are in [settings.json](/docs/settings#every-setting).

## An action in the peek is not there

Hush shows only the actions that you can do now. Look in **More**: a blocked action is there with the reason, such as “It has merge conflicts.” or “You cannot merge in this repository.” See [Actions on GitHub](/docs/peek#actions-on-github).

## Hush looks out of date

An installed app can stay in the background for days. Each time Hush comes back to the screen, it checks for a new version and loads it. To load it at once, reload the page, or close the app and open it again.

## Still stuck

Open an issue on [GitHub](https://github.com/ianmatson/hush/issues), or email [support@hush-gh.com](mailto:support@hush-gh.com), with what you did, what you expected, and what Hush showed.
