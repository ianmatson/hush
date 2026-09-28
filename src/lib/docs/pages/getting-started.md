---
title: Getting started
description: Sign in, answer three questions, learn the three lanes, and turn on push.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush runs its [tracked searches](/docs/where-hush-looks) (your review requests, your open PRs, what is assigned to you), then reads your notifications from the last 14 days. This takes a few seconds. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Answer three questions

The first time, **Welcome to Hush** is at the top of Your turn. It says what Hush found (“12 things waiting on you and 8 waiting on others, and moved 140 items to Updates”), and asks:

- **Review requests to my teams are my turn**: on or off. Most people with big teams leave this off; then team requests wait on the team, in Waiting.
- **Repositories you only want to read about**: the repositories that sent you the most notifications. Check the ones that you do not work on: everything from them goes to Updates (Hush adds a [rule](/docs/rules) for each).
- **Push to this device**: pushes only when something becomes your turn.

Choose **Done** to save, or **Skip**. You can change all of it later.

## 3. Know the three lanes

- **Your turn** ({{key:nav.turn}}): you are the next person who must act. People who wait on you come first, then your own work. See [Your turn](/docs/your-turn).
- **Waiting** ({{key:nav.waiting}}): you did your part; someone else must act. Grouped by whom it waits on.
- **Updates** ({{key:nav.updates}}): everything else from the last 14 days, newest first. Nothing there needs you.

A number next to a lane is how many items are in it.

## 4. Act

Each item in Your turn asks for one thing, shown on its main button: **Review**, **Fix CI**, **Reply**, **Merge**… Choose it to go to the right place on GitHub, or press {{key:list.peek}} to read it in the [peek](/docs/peek) and act from there.

Often you do nothing more: when you approve, reply, or push a fix, Hush sees it and the item leaves Your turn by itself, with a note such as “✓ You approved”. When you are finished with an item in another way:

- **Done** ({{key:item.done}}) hides it until it is your turn again.
- **Snooze** ({{key:item.snooze}}) hides it until a time, or until something happens (“until CI passes”).
- **Not my turn** ({{key:item.notMine}}) tells Hush that it was wrong, and fixes it for next time. See [Not my turn](/docs/your-turn#not-my-turn).

## 5. Turn on push

Go to **Settings → Notifications** and choose **Turn on** for this device. Hush pushes only what comes into Your turn. Do this on each browser or phone that should get pushes.

On iPhone and iPad, first add Hush to your Home Screen (Share → Add to Home Screen), open it from there, and then turn on push. See [Notifications](/docs/notifications).

## 6. Learn a few keys

{{ref:keys list.next list.prev list.peek list.open item.done item.snooze item.notMine palette list.help}}

You can change every key. See [Keybinds](/docs/keybinds).

## 7. Make it yours

- Hush was wrong about an item? Press {{key:item.notMine}} on it and pick the reason.
- Want a tab for one project? Press {{key:list.search}}, type a query such as `repo:acme/web-*`, and choose **Save as a tab**. See [Search](/docs/search).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → Account → Appearance**).
