---
title: How to triage GitHub notifications with the keyboard
description: GitHub's notification shortcuts (E, Shift+I, Shift+U, Shift+M), and a full keyboard flow in Hush to move, read, approve, merge, hide, and mute without the mouse.
---

## Short answer

**On github.com/notifications, press `E` to mark a notification as done, `Shift`+`I` to mark it as read, `Shift`+`U` to mark it as unread, and `Shift`+`M` to unsubscribe. Press `?` on any GitHub page to see its shortcuts. Hush adds a full keyboard flow: move with `J` and `K`, read with `Space`, and approve, merge, or hide each pull request with one key.**

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

Hush is built for the keyboard. The Pull requests and Issues tabs use the same keys, and the [peek](/docs/peek) lets you act on GitHub without leaving the list.

### 1. Move and read

{{ref:keys list.next list.prev list.peek list.open list.openGitHub}}

With the peek open on a wide screen, the list stays visible, and the peek follows the cursor as you move.

### 2. Act on GitHub from the peek

{{ref:keys peek.approve peek.comment editor.send peek.rerun peek.merge}}

**Approve** waits 5 seconds before Hush sends it, so you can undo it. **Merge** asks once more: press the key again to confirm.

### 3. Put it away

{{ref:keys dash.hide dash.mute dash.notNeeded}}

Often you do not need these: when you approve, reply, or push a fix, Hush sees it and the item leaves Your turn by itself.

### 4. Work on many items

{{ref:keys list.select list.extendNext list.selectAll list.escape}}

Hide, Mute, and Move to then act on every selected item.

### 5. Find and jump

{{ref:keys list.search palette dash.section.0 dash.section.1 list.help}}

The filter box finds items by text in the title, repository, author, turn reason, or labels. To keep a set of items, make a category or a tag with a rule in the [query language](/docs/query-language), for example:

```query
needs:review -author:bots repo:acme/*
```

### Change any key

Every key can change, in **Settings → Keybinds** or in [settings.json](/docs/settings#keys). For example, `d` for Hide and no key for Mute:

```json settings
{ "keys": { "dash.hide": ["d"], "dash.mute": [] } }
```

See [Keybinds](/docs/keybinds) for every shortcut.

## Which one to use

If your inbox is short, GitHub's four keys are enough. Hush helps when you review and follow many pull requests each day and want to read, approve, and merge them in one place. See [Hush vs. GitHub notifications](/compare/github-notifications). If you like the terminal, see [gh-dash](/compare/gh-dash).

## Sources

- [Keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts), GitHub Docs
- [Managing notifications from your inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox), GitHub Docs

_Last checked: 3 October 2026._
