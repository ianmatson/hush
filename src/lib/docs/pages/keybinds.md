---
title: Keybinds
description: Every keyboard shortcut, the command palette, and how to change any key.
---

Hush works from the keyboard. Press {{key:list.help}} on any list to see the shortcuts for it, with your keys.

## Search and commands

{{key:palette}} opens the command palette. Type to find:

- **Pull requests and issues** of your views, by title, repository, number, or author. Enter peeks at it; `Mod`+Enter opens it on GitHub.
- **Actions** on the item under the cursor or the selection: Snooze, Mute, Mark as read, Peek…, and **Mark all as read** for the view.
- **Group by** for the view you are in: type “group by”.
- **Pages**: every view, and each settings page.
- **Commands**: Sync with GitHub now, Switch to dark (or light) mode, a theme, Sign out.
- **Settings** that are on or off: type a word from the setting, for example “bots”, “drafts”, or “push”. Enter turns it on or off.

Before you type, the palette shows your **Recent** choices. It searches only what Hush already has, not all of GitHub.

## Change a key

Go to **Settings → Keybinds**. It lists every command by where it works.

- Choose **+** next to a command and press the new key. Esc cancels.
- The × on a key removes it. A command can have up to 4 keys, or none.
- If the key already does something where the command works, Hush says so. **Use it for …** moves the key to this command.
- The reset button next to a changed command puts back its default keys; **Reset all** resets every command.
- The search box finds a command by its name, or by a key: type a key to see what it does.

Your keys are saved at once, and follow you to every device. In settings.json they are the [`keys`](/docs/settings#keys) setting:

```json settings
{ "keys": { "dash.snooze": ["d"], "dash.mute": [], "list.peek": ["Space", "p"] } }
```

Mouse actions are not keys, and cannot change: ⌘-click (Ctrl-click) adds a row to the selection, and Shift-click selects a range.

## Where keys work

A key works in one scope. Keys can repeat across scopes that are never active together ({{key:dash.snoozeTomorrow}} snoozes an item in a view, and {{key:page.splitView}} changes the layout of the Files tab on a full page), but not inside scopes that are active at the same time.

- **Everywhere**: on every page.
- **Lists** and **Pull requests and issues**: in your views.
- **Peek**: while the [peek](/docs/peek) is open.
- **Full page**: on the [full page](/docs/peek#full-page) of a pull request or issue.
- **Text boxes**: while you type in the comment box or settings.json.

Keys do not work while you type in a text box, except the “Text boxes” keys and Esc.

## All shortcuts

The command id is the name in settings.json. `Mod` is ⌘ on a Mac and Ctrl on other computers.

{{ref:keybinds}}
