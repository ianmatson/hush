---
title: Getting started
description: Sign in, learn the Items page, turn on push, and act on your first pull requests and issues.
---

## 1. Sign in

Open [app.hush-gh.com](https://app.hush-gh.com) and choose **Sign in with GitHub**. Any GitHub account can sign in. GitHub asks you to let Hush read your notifications, your repositories, and your teams. If your org uses SAML single sign-on, GitHub also asks you to authorize Hush for it.

After you sign in, Hush searches GitHub for the open pull requests and issues that involve you. After that, Hush checks GitHub every few minutes by itself (see [Limits](/docs/limits)).

If an org that you work in is missing, its owners may not have approved Hush yet. Hush shows the orgs it can see in a note after sign-in. See [GitHub access](/docs/github-access).

## 2. Know the Items page

The **Items** page has two tabs: **Pull requests** and **Issues**. Each one groups the items by whose turn it is: **Your turn**, **Your team's turn**, **Waiting on others**, and **Other**. See [Pull requests and issues](/docs/pull-requests-and-issues) and [Whose turn](/docs/turns).

A number next to a tab is how many items are your turn there. The sidebar lists your categories and tags; choose one to see only its items.

The bell in the header opens **Notifications**: the alerts about your pull requests and issues from the last 30 days.

## 3. Act

Each item in Your turn asks for one thing, shown on its main button: **Review**, **Fix CI**, **Reply**, **Merge**… Choose it to go to the right place on GitHub, or press {{key:list.peek}} to read it in the [peek](/docs/peek) and act from there.

Often you do not need to do more: when you approve, reply, or push a fix, Hush sees it and the item leaves Your turn by itself. You can also:

- **Hide until it changes** ({{key:dash.hide}}): hides the item until something new happens on it.
- **Mute** ({{key:dash.mute}}): hides the item until you unmute it, and stops GitHub notifications for it.
- **Not my turn** ({{key:dash.notNeeded}}): tells Hush that it was wrong. See [Not my turn](/docs/turns#not-my-turn).

## 4. Turn on push

Go to **Settings → Notifications** and choose **Turn on** for this device. Hush pushes only what is your turn by default, and each PR or issue only once until you open Hush. Do this on each browser or phone that should get pushes.

On iPhone and iPad, first add Hush to your Home Screen (Share → Add to Home Screen), open it from there, and then turn on push. See [Notifications](/docs/notifications).

## 5. Learn a few keys

{{ref:keys list.next list.prev list.peek list.open dash.hide dash.mute palette list.help}}

You can change every key. See [Keybinds](/docs/keybinds).

## 6. Make it yours

- Want to see one project together? Make a category or a tag with a rule such as `repo:acme/web-*` in **Settings → Categories & tags**. See [Categories and tags](/docs/pull-requests-and-issues#categories-and-tags).
- Missing something, or too much? Change what Hush tracks in **Settings → Sources**. See [Sources](/docs/pull-requests-and-issues#sources).
- Install Hush as an app: in Chrome or Edge, choose **Install** in the address bar; in Safari on macOS, choose **File → Add to Dock**. The app icon can show a badge (**Settings → General → Tab title & icon**).
