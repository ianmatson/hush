---
title: Getting started
description: Sign in, learn the top bar, turn on push, and work through your first view.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. Any GitHub account can sign in. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush runs the searches of your [views](/docs/views), and opens your first view. The first sync can take a minute. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Know the top bar

Each tab in the top bar is a **view**. A view shows the open pull requests and issues that its GitHub searches find, in sections. Hush starts with **Mine**: the work that involves you, grouped by your role.

- A switch in the view shows its **Pull requests**, its **Issues**, or **Both**.
- Each row says whose turn it is, and why: “Review requested”, “CI failing”, “@alice replied”. The items that are your turn come first in each section.
- The number on a tab counts the unread items in that view.
- The bell lists the push alerts of the last 30 days.

See [Views](/docs/views) and [Pull requests and issues](/docs/pull-requests-and-issues).

## 3. Work through a view

Each item has one main action, shown on its button: **Review**, **Fix CI**, **Reply**, **Merge**… Choose it to go to the right place on GitHub. Or press {{key:list.peek}} to read the item in the [peek](/docs/peek), and act from there.

You do not need to clear items. When you approve, reply, or push a fix, Hush sees it, and the item stops being your turn. To take an item out of the list for a while:

- **Snooze** ({{key:dash.snooze}}) hides it until something new happens on it. The Snooze menu also has times, and events such as “until CI passes”.
- **Mute** ({{key:dash.mute}}) hides it until you unmute it.

Snooze and Mute stay in Hush. They do not change your notifications on GitHub. See [Snooze](/docs/pull-requests-and-issues#snooze).

## 4. Turn on push

Go to **Settings → Notifications** and choose **Turn on** for this device. By default, Hush pushes review requests, mentions, replies, reviews and failed CI on your pull requests, and assignments, and each PR or issue only once until you open Hush. See [What gets pushed](/docs/notifications#what-gets-pushed). Do this on each browser or phone that should get pushes.

On iPhone and iPad, first add Hush to your Home Screen (Share → Add to Home Screen), open it from there, and then turn on push. See [Notifications](/docs/notifications).

## 5. Learn a few keys

{{ref:keys list.next list.prev list.peek list.open dash.snooze dash.read palette list.help}}

You can change every key. See [Keybinds](/docs/keybinds).

## 6. Make it yours

- Want a tab for a repository that you own, or for a project board? Choose **+** at the end of the top bar and add a view with a search such as `repo:acme/website is:open`. See [Views](/docs/views).
- Sort your PRs and issues your own way: right-click an item, choose a group such as **Effort**, and choose a category. To make your own groups and rules, go to **Settings → Categories**. See [Categories](/docs/categories).
- Smart decisions are on: Jev, a decision model, reads your PRs and issues to decide whether new comments need you, and to choose categories. Turn it off in **Settings → Categories → Smart decisions**. See [smart decisions](/docs/settings#smartdecisions) and [Privacy](/privacy).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → General → Tab title & icon**).
