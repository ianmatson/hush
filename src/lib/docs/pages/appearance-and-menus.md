---
title: Appearance and menus
description: Themes, light and dark mode, counts on the tab and app icon, and the items of the right-click menu.
---

## Appearance

In **Settings → Account → Appearance**. These settings are in this browser only; they are not in settings.json.

- **Mode**: Light, Dark, or System (follows your computer).
- **Theme**: choose **Change…** to see every theme. Each theme has a light and a dark version; the mode picks one. The command palette can change the theme too. The themes (from [tweakcn](https://tweakcn.com)) are listed [below](#themes).

The counts on the browser tab and the app icon are here too: see [Tab title and icon](/docs/notifications#tab-title-and-icon).

Hush always opens on **Your turn**.

### Themes

{{ref:themes}}

## Menus

The right-click menu of a row (and its “⋯” menu on a phone) has the actions for it. You choose its items and their order in **Settings → Advanced → Menu**:

- Drag items to change the order. The × removes one.
- **Add item…** adds an item or a separator. Besides the main items, you can add one-click copies of choices from the Snooze menu, such as “Snooze until tomorrow 9:00” or “Snooze until CI passes”.
- **Preview** shows the menu as it will look.
- **Reset to default** puts back the default menu. Nothing changes until you choose **Save**.

Items that do not apply to a row are left out when the menu opens: Done for an item that is done, Not my turn for an item that is not in Your turn, or Open on GitHub when it is the same as the main action.

### Menu items

In settings.json, the menu is [`menu`](/docs/settings#menu): a list of these ids. `"sep"` is a separator line.

{{ref:menus}}
