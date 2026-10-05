---
title: Troubleshooting
description: What to do when notifications are missing, pushes do not arrive, or Hush shows an error.
---

## An org or a repository is missing

The org has probably not approved Hush. GitHub then hides the org completely. Check the list in **Settings → General → GitHub access**. If the org is not there, choose **Request approval**, and [use a custom token](/docs/github-access#custom-token) until an owner approves Hush.

If the org uses SAML single sign-on and the inbox says “GitHub hides notifications from N orgs”, sign in again and authorize Hush for those orgs.

## “Hush cannot read your notifications”

The token no longer works: you revoked Hush on GitHub, the token expired, or a custom token was deleted. Choose **Sign in again**. With a custom token, replace it in **Settings → General → GitHub access**.

## A thread is in the wrong list

- Look at the row: its summary says why Hush put it there, and “category: …” names the category whose inbox settings sorted it.
- Check your [categories](/docs/categories): the first rule that matches wins, so a wide rule at the top catches more than you expect. Your inbox rules from before are categories now, at the top of the list.
- Bots' activity is FYI by default ([`botsAreFyi`](/docs/settings#botsarefyi)), and so are team review requests ([`teamReviewsAreAction`](/docs/settings#teamreviewsareaction)).
- Press {{key:list.refresh}} to check GitHub again now.

## A thread did not leave Needs you

Hush sees your own review, reply, or push within 15 minutes, because GitHub sends no notification for them. Press {{key:list.refresh}} to check at once, or choose **Done**.

## Pushes do not arrive

1. In **Settings → Notifications**, check that this device says “Receives push notifications.”, and choose **Send test**.
2. Check that your system allows notifications from the browser, and that focus modes or Do Not Disturb are off.
3. Check [quiet hours](/docs/notifications#quiet-hours), and that the thread is one that gets pushed: by default only Needs you. A category with **Never push** stops pushes too.
4. Check [How often](/docs/notifications#how-often):
   - An item pushes once, and then not again until you open Hush or act on it ([`pushRepeat`](/docs/settings#pushrepeat)).
   - While Hush is open and in use on any device, it does not push ([`pushWhileOpen`](/docs/settings#pushwhileopen)).
   - A digest or a limit makes pushes wait.
5. On iPhone and iPad, push works only when Hush is on the Home Screen.
6. Turn push off and on again for the device.

Pushes can come a few minutes after the event: Hush checks GitHub every 5 minutes while push is on.

## The Pull requests or Issues tab is empty or incomplete

- The sources are GitHub searches. Choose the link button next to a source in **Settings → Sources** to try its search on GitHub.
- Check the **Scope**: it is added to every search.
- `@team` sources need your teams. If **Teams** says “GitHub reports no teams for you”, the token needs `read:org`, and SAML orgs must authorize it. Choose **Look up teams again** after you join a team.
- Hidden items: press {{key:dash.showHidden}} to show them.
- Drafts that others opened and PRs that bots opened are hidden by default: see [`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts) and [`dash.hideBots`](/docs/settings#dash-hidebots).

## An item is in the wrong category

- A category that you chose by hand wins. Right-click the item and choose **Category → Hush decides** to remove it.
- Then the first category whose rule matches wins. Check the order in **Settings → Categories & tags**.
- Jev chooses only among categories with a description, and only when it is sure. It reads an item again only when its title, description, or labels change. Choose **Re-evaluate items** to ask again after you change categories.
- `category:` and `tag:` work only in the Filter box of the Pull requests and Issues tabs, not in rules or saved views.

## settings.json does not save

Hush shows the first error under the box, and saves nothing until the file is valid. The error names the setting, for example `"quietHours.timeZone is not a known time zone."`. `Unknown setting "rules".` means that the file still has inbox rules: write them as [categories](/docs/categories), or import the file in **Settings → General → Settings file**, which changes them for you. The type and the allowed values of each setting are in [settings.json](/docs/settings#every-setting).

## An action in the peek is not there

Hush shows only the actions that you can do now. Look in **More**: a blocked action is there with the reason, such as “It has merge conflicts.” or “You cannot merge in this repository.” See [Actions on GitHub](/docs/peek#actions-on-github).

## Hush looks out of date

An installed app can stay in the background for days. Each time Hush comes back to the screen, it checks for a new version and loads it. To load it at once, reload the page, or close the app and open it again.

## Still stuck

Open an issue on [GitHub](https://github.com/ianmatson/hush/issues), with what you did, what you expected, and what Hush showed.
