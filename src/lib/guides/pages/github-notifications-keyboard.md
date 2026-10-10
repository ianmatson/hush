---
title: How to triage GitHub notifications with the keyboard
description: GitHub's notification shortcuts (E, Shift+I, Shift+U, Shift+M), and a full keyboard flow in Hush to move, read, approve, merge, snooze, and mute your pull requests without the mouse.
---

## Short answer

**On github.com/notifications, press `E` to mark a notification as done, `Shift`+`I` to mark it as read, `Shift`+`U` to mark it as unread, and `Shift`+`M` to unsubscribe. Press `?` on any GitHub page to see its shortcuts. Hush adds a full keyboard flow for your pull requests and issues: move with `J` and `K`, read with `Space`, and approve, merge, or snooze each one with one key.**

## GitHub's notification shortcuts

1. Press `G` then `N` on any GitHub page to go to your notifications.
2. Select a notification, then use these keys:

| Key         | Does                                                  |
| ----------- | ----------------------------------------------------- |
| `E`         | Mark as done. It leaves the inbox until new activity. |
| `Shift`+`I` | Mark as read.                                         |
| `Shift`+`U` | Mark as unread.                                       |
| `Shift`+`M` | Unsubscribe from the thread.                          |

3. Press `?` to see every shortcut of the page.

If single keys do nothing, check **Settings → Accessibility** on GitHub: you can turn off character key shortcuts there.

GitHub's shortcuts act on the notification. To review a pull request, open it and use the shortcuts of the pull request pages.

## A full keyboard flow in Hush

Hush is built for the keyboard. Each of your [views](/docs/views) uses the same keys, and the [peek](/docs/peek) lets you act on GitHub without leaving the list.

### 1. Move and read

{{ref:keys list.next list.prev list.peek list.open list.openGitHub}}

With the peek open on a wide screen, the list stays visible, and the peek follows the cursor as you move.

### 2. Act on GitHub from the peek

{{ref:keys peek.approve peek.comment editor.send peek.rerun peek.merge}}

**Approve** sends at once. **Merge** asks once more: press the key again to confirm.

### 3. Snooze, mute, or mark as read

{{ref:keys dash.snooze dash.snoozeTomorrow dash.mute dash.read dash.showSnoozed}}

Often you do not need a key: when you approve, reply, or push a fix, Hush sees it, and the item stops being your turn. Snooze, Mute, and Read stay in Hush: they do not change your notifications on GitHub.

### 4. Work on many items

{{ref:keys list.select list.extendNext list.selectAll list.escape}}

Snooze, Mute, and Read then act on every selected item.

### 5. Find and jump

{{ref:keys list.search palette dash.view.1 dash.view.2 dash.kind list.help}}

Search finds a pull request or issue by words from its title, its repository, or its number. The palette also has actions, settings, and **Mark all as read**.

### Change any key

Every key can change, in **Settings → Keybinds** or in [settings.json](/docs/settings#keys). For example, `d` for Snooze and no key for Mute:

```json settings
{ "keys": { "dash.snooze": ["d"], "dash.mute": [] } }
```

See [Keybinds](/docs/keybinds) for every shortcut.

## Which one to use

If your GitHub inbox is short, GitHub's four keys are enough. Hush helps when you work through many pull requests each day and want to read, approve, and merge them in one place. See [Hush vs. GitHub notifications](/compare/github-notifications). If you like the terminal, see [gh-dash](/compare/gh-dash).

## Sources

- [Keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts), GitHub Docs
- [Managing notifications from your inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox), GitHub Docs

_Last checked: 3 October 2026._
