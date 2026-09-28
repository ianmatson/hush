---
title: Getting started
description: Sign in, learn the three tabs, turn on push, and triage your first threads.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush reads your notifications from the last 14 days. The first sync takes a few seconds; the inbox says “First sync in progress…” until it is done. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Know the three tabs

- **Inbox**: your GitHub notifications, sorted. The **Needs you** tab has only what waits on you; **FYI** has the rest. Snoozed, Done, and Muted are there too. See [Inbox](/docs/inbox).
- **Pull requests**: open PRs that involve you, from saved GitHub searches, grouped by whose turn it is. See [Pull requests and issues](/docs/pull-requests-and-issues).
- **Issues**: the same for issues.

A number next to a tab is how many items are your turn there.

## 3. Triage

Each thread in Needs you asks for one thing, shown on its main button: **Review**, **Fix CI**, **Reply**, **Merge**… Choose it to go to the right place on GitHub, or press {{key:list.peek}} to read it in the [peek](/docs/peek) and act from there.

When you are finished with a thread:

- **Done** ({{key:inbox.done}}) moves it out of the inbox, and marks it done on GitHub. New activity brings it back.
- **Snooze** ({{key:inbox.snooze}}) hides it until a time, or until something happens (“until CI passes”).
- **Mute** ({{key:inbox.mute}}) stops GitHub notifications for the thread.

Often you do not need Done: when you approve, reply, or push a fix, Hush sees it and moves the thread to Done by itself, with a note such as “✓ You approved”.

## 4. Turn on push

Go to **Settings → Notifications** and choose **Turn on** for this device. Hush pushes only “Needs you” threads by default. Do this on each browser or phone that should get pushes.

On iPhone and iPad, first add Hush to your Home Screen (Share → Add to Home Screen), open it from there, and then turn on push. See [Notifications](/docs/notifications).

## 5. Learn a few keys

{{ref:keys list.next list.prev list.peek list.open inbox.done inbox.snooze palette list.help}}

You can change every key. See [Keybinds](/docs/keybinds).

## 6. Make it yours

- Too much in Needs you from one repository? Right-click a thread and choose **Make a rule…**. See [Rules](/docs/rules).
- Want a tab for one project? Type a filter such as `repo:acme/web-*` and choose **Save this filter as a view**. See [Saved views](/docs/views).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → General → Tab title & icon**).
