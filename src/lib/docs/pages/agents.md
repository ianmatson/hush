---
title: For agents
description: How an AI agent or a script can read these docs, write a user's settings.json, and check it before the user saves it.
---

This page is for AI agents, scripts, and people who automate their setup. It says how to read the docs, and how to set up Hush for a user.

## Read the docs

- [/llms.txt](/llms.txt) lists every page, with its Markdown address.
- [/llms-full.txt](/llms-full.txt) has every page in one file.
- Every page is Markdown at its address plus `.md`: [/docs/settings.md](/docs/settings.md), [/docs/rules.md](/docs/rules.md)… The docs home is [/docs/index.md](/docs/index.md).

The reference tables (settings, keys, query words, menu items) are made from Hush's own source code when the site is built, so they match the version that runs.

## What an agent can do

Hush has no public API. Its API accepts only a signed-in browser session, and it may change at any time. So an agent sets Hush up **through the user**:

1. Write the user's settings as JSON (see below).
2. Give it to the user, who pastes it into **Settings → Account → Settings file → Edit settings.json** and chooses **Save**, or imports it as a file in **Settings → Account → Settings file**.

Hush checks the JSON and shows an error if something is wrong; nothing is saved then. Everything about placement, pushes, rules, searches, the menu, and keys is in settings.json. The things that are not (appearance, push devices, feeds, a custom token) are listed in [settings.json](/docs/settings#what-is-not-in-settings-json).

## Write settings.json

- Write only what differs from the defaults. Leave out every setting that you do not change.
- **Saving replaces all settings.** Ask the user for their current settings.json first (they can copy it from the page), and change that. A file without their rules deletes their rules.
- `rules`, `searches`, `saved`, `excludedTeams`, and `menu` are lists: write the whole list. `keys` and `quietHours` are objects: write the whole object.
- Every key, type, default, and limit is in [settings.json](/docs/settings). The words of rule and saved-search queries are in the [query language](/docs/query-language).

To make a settings file to import, put the settings in this wrapper:

```json
{ "hush": 2, "exportedAt": "2026-09-28T09:00:00.000Z", "settings": { "botsAreUpdates": true } }
```

### Check it before the user saves it

Check these, or Hush refuses the file:

- Every rule has `when` (a query, as text; `""` matches every item) and `then` with at least one of `lane`, `push`, `mute`, or `snoozeHours`.
- `lane` is `"turn"` or `"updates"`. `snoozeHours` is a whole number from 1 to 720. `mute` and `push` are `true` or `false`.
- Queries use only the words of the [query language](/docs/query-language#words), with the values that it lists (`needs:fix-ci`, `type:pr`, `event:review-requested`). In rules, `is:done`, `is:snoozed`, and `is:muted` are errors.
- Saved-search ids are 1 to 16 lower-case letters or digits, and unique; names are 1 to 40 characters; at most 12.
- Tracked-search ids are 1 to 40 lower-case letters, digits, or dashes; queries are 1 to 256 characters of GitHub search; at most 20.
- Key names follow the [key format](/docs/settings#keys); command ids are in the [keybinds table](/docs/keybinds#all-shortcuts).
- `quietHours.timeZone` is an IANA time zone, and `from` and `to` are minutes (0 to 1439) that differ.

## Recipes

**“Only my repositories can be my turn.”** Rules have no “not”, so keep what is your turn in your repositories with a first rule, and send everything else to Updates with a wide rule after it:

```json settings
{
	"rules": [
		{
			"name": "My repos can be my turn",
			"when": "repo:acme/web,acme/api in:turn",
			"then": { "lane": "turn" }
		},
		{ "name": "Everything else is updates", "when": "in:turn", "then": { "lane": "updates" } }
	]
}
```

An item that is your turn in acme/web or acme/api matches the first rule and stays in Your turn. Every other item that Hush put in Your turn matches the second rule. Waiting stays as it is. A saved search per project is another way: it adds a tab and hides nothing.

**“Push me only when someone reviews my PRs.”**

```json settings
{
	"push": false,
	"rules": [
		{
			"name": "Reviews on my PRs",
			"when": "type:pr needs:changes,merge",
			"then": { "push": true }
		}
	]
}
```

**“Quiet at night and on weekends in Berlin.”**

```json settings
{ "quietHours": { "from": 1260, "to": 480, "weekends": true, "timeZone": "Europe/Berlin" } }
```

**“Done on D, Mute on Shift+D, and no key for Snooze.”**

```json settings
{ "keys": { "item.done": ["d"], "item.mute": ["Shift+d"], "item.snooze": [] } }
```

**“Look only in the acme org, and skip the everyone team.”**

```json settings
{ "searchScope": "org:acme archived:false", "excludedTeams": ["acme/everyone"] }
```

## Explain Hush to a user

When a user asks why an item is in Your turn, the answer is in [What makes it your turn](/docs/your-turn#what-makes-it-your-turn). The item also says it: the top of its peek (“Your turn: Review requested for 2d.”), and “rule: …” if a rule placed it. If Hush is wrong, tell the user to choose [Not my turn](/docs/your-turn#not-my-turn) on it: that fixes the cause, not only the item.
