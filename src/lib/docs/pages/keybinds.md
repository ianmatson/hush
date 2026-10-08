---
title: Keybinds
description: Every keyboard shortcut, the command palette, and how to change any key.
---

Hush works from the keyboard. Press {{key:list.help}} on any list to see the shortcuts for it, with your keys.

## Search and commands

{{key:palette}} opens the command palette. Type to find:

- **Threads, pull requests, and issues** by title or repository. Enter peeks at it; `Mod`+Enter opens it on GitHub.
- **Actions** on the item under the cursor or the selection: Mark as done, Snooze, Mute, Peek, Move to…
- **Pages**: every inbox tab and notification view, Pull requests, Issues, and each settings page.
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
{ "keys": { "inbox.done": ["d"], "inbox.mute": [], "list.peek": ["Space", "p"] } }
```

Mouse actions are not keys, and cannot change: ⌘-click (Ctrl-click) adds a row to the selection, Shift-click selects a range, and on the Pull requests and Issues tabs you drag ⋮⋮ to move an item.

## Where keys work

A key works in one scope. Keys can repeat across scopes that are never active together ({{key:inbox.done}} is Done in the inbox and {{key:dash.hide}} is Hide on the Pull requests tab), but not inside scopes that are active at the same time.

- **Everywhere**: on every page.
- **Lists**: the inbox and the Pull requests and Issues tabs.
- **Inbox** and **Pull requests and issues**: only on those pages.
- **Peek**: while the [peek](/docs/peek) is open.
- **Text boxes**: while you type in the comment box or settings.json.

Keys do not work while you type in a text box, except the “Text boxes” keys and Esc.

## All shortcuts

The command id is the name in settings.json. `Mod` is ⌘ on a Mac and Ctrl on other computers.

{{ref:keybinds}}
