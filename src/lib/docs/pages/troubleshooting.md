---
title: Troubleshooting
description: What to do when notifications are missing, pushes do not arrive, or Hush shows an error.
---

## An org or a repository is missing

The org has probably not approved Hush. GitHub then hides the org completely. Check the list in **Settings → Account → GitHub access**. If the org is not there, choose **Request approval**, and [use a custom token](/docs/github-access#custom-token) until an owner approves Hush.

If the org uses SAML single sign-on and Hush says “GitHub hides notifications from N orgs”, sign in again and authorize Hush for those orgs.

## “Hush cannot read your notifications”

The token no longer works: you revoked Hush on GitHub, the token expired, or a custom token was deleted. Choose **Sign in again**. With a custom token, replace it in **Settings → Account → GitHub access**.

## An item is in the wrong lane

- Open it in the [peek](/docs/peek): the top says why it is there, and names the rule that placed it, if any.
- If it is in Your turn and it should not be, choose **Not my turn** ({{key:item.notMine}}). The answer fixes the setting or adds the rule. See [Not my turn](/docs/your-turn#not-my-turn).
- If it should be your turn, choose **It is my turn** ({{key:item.myTurn}}).
- Check your [rules](/docs/rules): the first rule that matches wins, so a wide rule at the top catches more than you expect.
- Bots' activity is an update by default ([`botsAreUpdates`](/docs/settings#botsareupdates)), and team review requests wait on the team ([`teamReviewsAreMine`](/docs/settings#teamreviewsaremine)).
- Press {{key:list.refresh}} to check GitHub again now.

## An item did not leave Your turn

Hush sees your own review, reply, or push within 15 minutes, because GitHub sends no notification for them. Press {{key:list.refresh}} to check at once, or choose **Done**.

## An item is missing

- Look in [Search](/docs/search): choose **Everything**. It may be done, snoozed, or muted.
- Hush finds items from your notifications and from its [tracked searches](/docs/where-hush-looks). An item with no notification in the last 14 days, which no tracked search finds, is not in Hush. Add a search in **Settings → Advanced → Where Hush looks**, and choose the link button next to it to try it on GitHub.
- Check the **Scope**: it is added to every search.
- `@team` searches need your teams. If **Teams** says “GitHub reports no teams for you”, the token needs `read:org`, and SAML orgs must authorize it. Choose **Look up teams again** after you join a team.

## Pushes do not arrive

1. In **Settings → Notifications**, check that this device says “Receives push notifications.”, and choose **Send test**.
2. Check that your system allows notifications from the browser, and that focus modes or Do Not Disturb are off.
3. Check [quiet hours](/docs/notifications#quiet-hours), and that the item is one that gets pushed: only what comes into Your turn. A rule with `"push": false` stops pushes too.
4. On iPhone and iPad, push works only when Hush is on the Home Screen.
5. Turn push off and on again for the device.

Pushes can come a few minutes after the event: Hush checks GitHub every 5 minutes while push is on.

## settings.json does not save

Hush shows the first error under the box, and saves nothing until the file is valid. The error names the setting, for example `"quietHours.timeZone is not a known time zone."`. The type and the allowed values of each setting are in [settings.json](/docs/settings#every-setting).

## An action in the peek is not there

Hush shows only the actions that you can do now. Look in **More**: a blocked action is there with the reason, such as “It has merge conflicts.” or “You cannot merge in this repository.” See [Actions on GitHub](/docs/peek#actions-on-github).

## Still stuck

Open an issue on [GitHub](https://github.com/ianmatson/hush/issues), with what you did, what you expected, and what Hush showed.
