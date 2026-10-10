---
title: Appearance and menus
description: Themes, light and dark mode, the start page, and the items of the right-click menus.
---

## Appearance

In **Settings → General → Appearance**. These settings are in this browser only; they are not in settings.json.

- **Mode**: Light, Dark, or System (follows your computer).
- **Theme**: choose **Change…** to see every theme. Each theme has a light and a dark version; the mode picks one. The command palette can change the theme too. The themes (from [tweakcn](https://tweakcn.com)) are listed [below](#themes).
- **Start page**: the view that Hush opens first. The list has your views. The default is your first view.

The counts on the browser tab and the app icon are here too: see [Tab title and icon](/docs/notifications#tab-title-and-icon).

### Themes

{{ref:themes}}

## Menus

The right-click menu of a pull request or issue (and its “⋯” menu on a phone) has the actions for it. You choose its items and their order, in **Settings → General → Menus**:

- Drag items to change the order. The × removes one.
- **Add item…** adds an item that is not in the menu, or a separator.
- **Preview** shows the menu as it will look.
- **Reset to default** puts back the default menu. Nothing changes until you choose **Save**.

Items that do not apply to an item are left out when the menu opens, such as Open on GitHub when it is the same as the main action.

### Menu items

In settings.json, the menu is [`menus.dash`](/docs/settings#menus-dash): a list of these ids. `"sep"` is a separator line.

{{ref:menus}}

## Swipe actions

On a phone or tablet, swipe a row to the right or to the left:

- **A short swipe** rests open: the action shows as a button beside the row. Tap it to act. Tap the row, or swipe it back, to close it.
- **A long swipe** (past about half of the row) acts at once.

You choose the action of each direction in **Settings → General → Swipe actions**. The defaults: swipe right is **Snooze until new activity**, and swipe left is **Mute**. The other choices are **Read / unread** and **Nothing**.

Only a finger swipes. A mouse or a pen never does. In settings.json, the actions are [`swipe.dash`](/docs/settings#swipe-dash).
