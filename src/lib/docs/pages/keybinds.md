---
title: Keybinds
description: Every keyboard shortcut, the command palette, and how to change any key.
---

Hush works from the keyboard. Press {{key:list.help}} on any list to see the shortcuts for it, with your keys.

## Search and commands

{{key:palette}} opens the command palette. Type to find:

- **Items** by title or repository. Choosing one peeks at it.
- **Actions** on the item under the cursor or the selection: Done, Snooze, Mute, Not my turn, Peek, Copy link…
- **Pages**: the lanes, Search, Done, Snoozed, Muted, your saved searches, and each settings page.
- **Commands**: Sync with GitHub now, light or dark mode, a theme, Sign out.

## Change a key

Go to **Settings → Keybinds**. It lists every command by where it works.

- Choose **+** next to a command and press the new key. Esc cancels.
- The × on a key removes it. A command can have up to 4 keys, or none.
- If the key already does something where the command works, Hush says so. **Use it for …** moves the key to this command.
- The reset button next to a changed command puts back its default keys; **Reset all** resets every command.
- The search box finds a command by its name, or by a key: type a key to see what it does.

Your keys are saved at once, and follow you to every device. In settings.json they are the [`keys`](/docs/settings#keys) setting:

```json settings
{ "keys": { "item.done": ["d"], "item.mute": [], "list.peek": ["Space", "p"] } }
```

Mouse actions are not keys, and cannot change: ⌘-click (Ctrl-click) adds a row to the selection, and Shift-click selects a range.

## Where keys work

A key works in one scope. Two commands can have the same key only when their scopes are never active together: the “Text boxes” keys work only while you type, so they can use keys that the lists also use.

- **Everywhere**: on every page. {{key:nav.turn}}, {{key:nav.waiting}}, and {{key:nav.updates}} go to the lanes; {{key:nav.saved.1}} to {{key:nav.saved.6}} to your saved searches.
- **Lists**: the lanes and Search: move, select, peek, open.
- **Items**: what you do to the item under the cursor or the selection: Done, Snooze, Mute, Not my turn…
- **Peek**: while the [peek](/docs/peek) is open: the actions on GitHub.
- **Text boxes**: while you type in the comment box or settings.json.

Keys do not work while you type in a text box, except the “Text boxes” keys and Esc.

## All shortcuts

The command id is the name in settings.json. `Mod` is ⌘ on a Mac and Ctrl on other computers.

{{ref:keybinds}}
