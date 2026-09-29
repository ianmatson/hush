---
title: Appearance and menus
description: Themes, light and dark mode, the start page, and the items of the right-click menus.
---

## Appearance

In **Settings → General → Appearance**. These settings are in this browser only; they are not in settings.json.

- **Mode**: Light, Dark, or System (follows your computer).
- **Theme**: choose **Change…** to see every theme. Each theme has a light and a dark version; the mode picks one. The command palette can change the theme too. The themes (from [tweakcn](https://tweakcn.com)) are listed [below](#themes).
- **Start page**: the tab that Hush opens first: Inbox, Pull requests, or Issues.

The counts on the browser tab and the app icon are here too: see [Tab title and icon](/docs/notifications#tab-title-and-icon).

### Themes

{{ref:themes}}

## Menus

The right-click menu of a row (and its “⋯” menu on a phone) has the actions for it. You choose its items and their order, in **Settings → General → Menus**, for **Inbox** and for **PRs & issues**:

- Drag items to change the order. The × removes one.
- **Add item…** adds an item or a separator. Besides the main items, you can add one-click copies of choices from submenus, such as “Snooze until tomorrow 9:00” or “Move to Your turn”.
- **Preview** shows the menu as it will look.
- **Reset to default** puts back the default menu. Nothing changes until you choose **Save**.

Items that do not apply to a row are left out when the menu opens: Done in the Done tab, or Open on GitHub when it is the same as the main action.

### Menu items

In settings.json, menus are [`menus.inbox`](/docs/settings#menus-inbox) and [`menus.dash`](/docs/settings#menus-dash): lists of these ids. `"sep"` is a separator line.

{{ref:menus}}

## Swipe actions

On a phone or tablet, swipe a row to the right or to the left:

- **A short swipe** rests open: the action shows as a button beside the row. Tap it to act. Tap the row, or swipe it back, to close it.
- **A long swipe** (past about half of the row) acts at once.

You choose the action of each direction, for the inbox and for the Pull requests and Issues tabs, in **Settings → General → Swipe actions**. The defaults: in the inbox, swipe right is **Done** and swipe left is **Snooze**; on the dashboards, swipe right is **Hide until it changes** and swipe left is **Mute**. An action that does not apply to a row (Done on a thread that is done) does nothing there.

Only a finger swipes. A mouse or a pen never does, so on the dashboards they still drag rows. In settings.json, the actions are [`swipe.inbox`](/docs/settings#swipe-inbox) and [`swipe.dash`](/docs/settings#swipe-dash).
