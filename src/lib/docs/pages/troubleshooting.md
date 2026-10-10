---
title: Troubleshooting
description: What to do when notifications are missing, pushes do not arrive, or Hush shows an error.
---

## An org or a repository is missing

The org has probably not approved Hush. GitHub then hides the org completely. Check the list in **Settings → General → GitHub access**. If the org is not there, choose **Request approval**, and [use a custom token](/docs/github-access#custom-token) until an owner approves Hush.

If the org uses SAML single sign-on and the inbox says “GitHub hides notifications from N orgs”, sign in again and authorize Hush for those orgs.

## A notification is missing

Hush keeps only the notifications about the PRs and issues that it tracks. See [What comes in](/docs/inbox#what-comes-in).

- Check that one of your [views](/docs/views) has the PR or issue. If none has it, change a view's searches, or add a view that finds it, in **Settings → Views**.
- Items that views hide by default are not tracked: drafts that others opened, and PRs and issues that bots or GitHub Apps opened. Turn them on in **Settings → Views → Filters**. See [`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts) and [`dash.hideBots`](/docs/settings#dash-hidebots).
- Notifications that are not about a PR or issue do not come in: releases, CI and workflow runs, discussions, commits, security alerts, and invitations. Read them on GitHub.
- A notification can come before a search finds its item. Hush runs the searches again and gets unread notifications again at the next sync, so it comes in within about 15 minutes.
- A notification about a PR or issue that no view finds any more comes in for 14 days more. After you change your views, it stops at once.

## “Hush cannot read your notifications”

The token no longer works: you revoked Hush on GitHub, the token expired, or a custom token was deleted. Choose **Sign in again**. With a custom token, replace it in **Settings → General → GitHub access**.

## A thread is in the wrong list

- Look at the row: its summary says why Hush put it there. [Categories](/docs/categories) do not change the list.
- If it does not need you, choose [Doesn't need me](/docs/inbox#doesnt-need-me). Hush can fix a setting for you, or move only this thread.
- Bots' activity is FYI by default ([`botsAreFyi`](/docs/settings#botsarefyi)), and so are team review requests ([`teamReviewsAreAction`](/docs/settings#teamreviewsareaction)).
- Press {{key:list.refresh}} to check GitHub again now.

## A thread did not leave Needs you

Hush sees your own review, reply, or push within 15 minutes, because GitHub sends no notification for them. Press {{key:list.refresh}} to check at once, or choose **Done**.

## Pushes do not arrive

1. In **Settings → Notifications**, check that this device says “Receives push notifications.”, and choose **Send test**.
2. Check that your system allows notifications from the browser, and that focus modes or Do Not Disturb are off.
3. Check [quiet hours](/docs/notifications#quiet-hours), and that the thread is one that gets pushed: by default only Needs you.
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
- Hidden items: press {{key:dash.showHidden}} to show them.
- Drafts that others opened and PRs and issues that bots opened are hidden by default (**Settings → Views → Filters**): see [`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts) and [`dash.hideBots`](/docs/settings#dash-hidebots).

## An item is in the wrong category

- A category that you chose by hand wins. Right-click the item, choose the group's name, and then **Choose automatically** to remove your choice.
- The first category whose rule matches wins. Check the order in **Settings → Categories**.
- Jev chooses only among categories with a description, and only when a group has two or more of them. It reads an item again only when its title, description, or labels change, or when you change the descriptions of a group. Choose **Re-evaluate items** to ask again about every category.
- When Jev is off or cannot answer, and no rule matches, the item is Not sorted in that group: it has no category from the group.
- Rules look only at the PR or issue. They cannot use `category:`, `event:`, `needs:`, or `in:`.
- A notification has the categories of its PR or issue. To change them, change the categories of the PR or issue.

## settings.json does not save

Hush shows the first error under the box, and saves nothing until the file is valid. The error names the setting, for example `"quietHours.timeZone is not a known time zone."`. `Unknown setting "rules".`, `Unknown setting "categories".`, or `Unknown setting "tags".` means that the file has a setting that Hush no longer has. Remove it. Categories are in [`categoryGroups`](/docs/settings#categorygroups) now. The type and the allowed values of each setting are in [settings.json](/docs/settings#every-setting).

## An action in the peek is not there

Hush shows only the actions that you can do now. Look in **More**: a blocked action is there with the reason, such as “It has merge conflicts.” or “You cannot merge in this repository.” See [Actions on GitHub](/docs/peek#actions-on-github).

## Hush looks out of date

An installed app can stay in the background for days. Each time Hush comes back to the screen, it checks for a new version and loads it. To load it at once, reload the page, or close the app and open it again.

## Still stuck

Open an issue on [GitHub](https://github.com/ianmatson/hush/issues), or email [support@hush-gh.com](mailto:support@hush-gh.com), with what you did, what you expected, and what Hush showed.
