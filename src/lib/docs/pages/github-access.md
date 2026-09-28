---
title: GitHub access
description: What Hush can read and do on GitHub, why an org can be missing, and when to use a custom token.
---

## What Hush asks for

You sign in with GitHub. Hush asks for three scopes:

| Scope           | Why Hush needs it                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `notifications` | Read your notifications, and mark them read, done, or muted.                                                                         |
| `repo`          | Read the pull requests and issues behind them (CI, reviews, comments), and act on them when you ask: approve, comment, merge, close. |
| `read:org`      | Find your teams, for team review requests and `@team` searches.                                                                      |

GitHub's Notifications API accepts only these classic scopes, so Hush cannot ask for less.

Hush stores the token encrypted. It acts on GitHub **only when you do**: when you see an item, choose Done or Mute, or choose an action in the [peek](/docs/peek). It never writes by itself. To keep your GitHub notifications as they are, turn off **Keep GitHub in step** ([`markReadOnGitHub`](/docs/settings#markreadongithub)).

## What Hush does on GitHub

| In Hush                                       | On GitHub                                                           |
| --------------------------------------------- | ------------------------------------------------------------------- |
| You see an item (peek, open, “Mark all seen”) | Marks its notification as read, with **Keep GitHub in step** on.    |
| Done                                          | Marks its notification as done, with **Keep GitHub in step** on.    |
| Mute                                          | Unsubscribes you from the thread, and marks it as done.             |
| Snooze, Not my turn, It is my turn, Move back | Nothing. These stay in Hush.                                        |
| Actions in the peek                           | The action itself: a review, a comment, a merge, a re-run, a close. |

## When an org is missing

Many orgs allow only the apps that an owner approved. **Until an owner approves Hush, GitHub hides that org completely**: its private repositories, its notifications, and even the fact that the org exists. So Hush cannot tell you which orgs are missing. It can only show the ones it sees.

After you sign in, a note lists the orgs that Hush can see. The same list is in **Settings → Account → GitHub access**, under “Orgs your GitHub sign-in can see”. If one is missing:

1. Choose **Request approval**. GitHub asks the org's owners to approve Hush.
2. Until they do, you can [use a custom token](#custom-token).

**Don't show again** in the note hides it in this browser. **Show the note after sign-in again**, under the org list, brings it back.

### SAML single sign-on

If an org uses SAML SSO, GitHub asks you to authorize Hush for it when you sign in. If you did not, Hush shows “GitHub hides notifications from N orgs”. Sign in again and authorize the org. For a custom token, choose **Configure SSO** next to the token on github.com/settings/tokens.

## Custom token

A custom token is a token that you give Hush in place of your GitHub sign-in. Use one only when an org has not approved Hush yet.

1. Get a token for **your own account** that can read notifications:
   - The GitHub CLI's token: run `gh auth token`. Many orgs already approved the GitHub CLI.
   - Or a classic personal access token with the `notifications`, `repo`, and `read:org` scopes, if the org allows classic tokens.
2. Go to **Settings → Account → GitHub access** and choose **Use a custom token…**.
3. Paste the token and choose **Save**. Hush checks that it belongs to the account you signed in with, and syncs again at once.

Fine-grained tokens do not work: GitHub's Notifications API does not accept them.

While Hush uses a custom token, GitHub access shows a **Custom token** badge. Signing in again keeps the custom token. To stop using it, choose **Switch back to GitHub sign-in**; to change it, choose **Replace the token…**.

## Sign out and delete your account

Both are in **Settings → Account**, and **Sign out** is also in the account menu.

- **Sign out** ends the session in this browser and clears the Hush data cached in it. Hush keeps polling for your other devices.
- **Delete account** stops polling and deletes everything Hush stores about you: your token, items, settings, alert history, push devices, and feeds. It does not change anything on GitHub. To remove Hush's access on GitHub too, revoke it in GitHub's settings (Applications → Authorized OAuth Apps).

### Where you are signed in

**Settings → Account → Signed in** lists each browser where you are signed in, with when it was last used. **Sign out** next to one ends that session; **Sign out everywhere else** ends all but this one. Use it if you lose a device.

A session ends after 7 days with no use, or 30 days after sign-in; then sign in again. When GitHub stops accepting your token (for example, you revoked Hush on GitHub), Hush signs you out everywhere.
