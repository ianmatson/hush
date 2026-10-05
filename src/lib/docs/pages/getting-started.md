---
title: Getting started
description: Sign in, learn the three tabs, turn on push, and triage your first threads.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. Any GitHub account can sign in. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush runs your [sources](/docs/pull-requests-and-issues#sources) and reads your notifications from the last 14 days. It keeps only the notifications about the PRs and issues that your sources find (see [What comes in](/docs/inbox#what-comes-in)). The first sync can take a minute; the inbox says “First sync in progress…” until it is done. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

The first time, **Welcome to Hush** is at the top of the inbox. It says what Hush found (“From 47 notifications, Hush found 5 things that need you. It moved 6 to FYI, and 36 that are already finished to Done.”), and asks three questions:

- **Review requests to my teams need me**: on or off. Off, team requests are FYI, and show under “Your team's turn” on the Pull requests tab.
- **Repositories you only want to read about**: the repositories with the most notifications that do not need you. Everything from the ones that you check goes to FYI: Hush adds a [category](/docs/categories) named “Read only” for them, with its threads set to FYI.
- **Push to this device**: pushes what needs you.

Choose **Done** to save, or **Skip**. You can change all of it later.

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Know the three tabs

- **Inbox**: your GitHub notifications about the PRs and issues that Hush tracks, sorted. The **Needs you** tab has only what waits on you; **FYI** has the rest. Snoozed, Done, and Muted are there too. See [Inbox](/docs/inbox).
- **Pull requests**: open PRs that involve you, from saved GitHub searches (your sources), grouped by whose turn it is, each with a category and tags. See [Pull requests and issues](/docs/pull-requests-and-issues).
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

Go to **Settings → Notifications** and choose **Turn on** for this device. Hush pushes only “Needs you” threads by default, and each PR or issue only once until you open Hush. Do this on each browser or phone that should get pushes.

On iPhone and iPad, first add Hush to your Home Screen (Share → Add to Home Screen), open it from there, and then turn on push. See [Notifications](/docs/notifications).

## 5. Learn a few keys

{{ref:keys list.next list.prev list.peek list.open inbox.done inbox.snooze palette list.help}}

You can change every key. See [Keybinds](/docs/keybinds).

## 6. Make it yours

- Too much in Needs you from one repository? Right-click a thread and choose **Make a category…**. See [Categories and tags](/docs/categories).
- Smart decisions are on: Jev, a decision model, reads your PRs and issues to decide whether new comments need you, and to choose categories. Turn it off in **Settings → Inbox → Defaults**. See [smart decisions](/docs/settings#smartdecisions) and [Privacy](/privacy).
- Want a tab for one project? Type a filter such as `repo:acme/web-*` and choose **Save this filter as a notification view**. See [Notification views](/docs/views).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → General → Tab title & icon**).
