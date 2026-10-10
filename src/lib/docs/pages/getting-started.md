---
title: Getting started
description: Sign in, learn the three tabs, turn on push, and triage your first threads.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. Any GitHub account can sign in. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush runs the searches of your [views](/docs/views) and reads your notifications from the last 14 days. It keeps only the notifications about the PRs and issues of your views (see [What comes in](/docs/inbox#what-comes-in)). The first sync can take a minute; the inbox says “First sync in progress…” until it is done. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

The first time, **Welcome to Hush** is at the top of the inbox. It says what Hush found (“From 47 notifications, Hush found 5 things that need you. It moved 6 to FYI, and 36 that are already finished to Done.”), and asks two questions:

- **Review requests to my teams need me**: on or off. Off, team requests are FYI, and show under “Your team's turn” on the Pull requests tab.
- **Push to this device**: pushes what needs you.

Choose **Done** to save, or **Skip**. You can change all of it later.

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Know the top bar

- **Views**: each view is a tab with the open pull requests and issues that its GitHub searches find, grouped by whose turn it is, each with its categories. Hush starts with **Mine**: the work that involves you. A switch in the view shows its pull requests or its issues. See [Views](/docs/views) and [Pull requests and issues](/docs/pull-requests-and-issues).
- **Inbox**: your GitHub notifications about the PRs and issues of your views, sorted. The **Needs you** tab has only what waits on you; **FYI** has the rest. Snoozed, Done, and Muted are there too. See [Inbox](/docs/inbox).

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

- Something in Needs you that does not need you? Choose **Doesn't need me** on it. See [Doesn't need me](/docs/inbox#doesnt-need-me).
- Sort your PRs and issues your own way: right-click a thread and choose **Make a category…**. See [Categories](/docs/categories).
- Smart decisions are on: Jev, a decision model, reads your PRs and issues to decide whether new comments need you, and to choose categories. Turn it off in **Settings → Inbox → Defaults**. See [smart decisions](/docs/settings#smartdecisions) and [Privacy](/privacy).
- Want a tab for a repository that you own, or for a project board? Choose **+** at the end of the top bar and add a view with a search such as `repo:acme/website is:open`. See [Views](/docs/views).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → General → Tab title & icon**).
