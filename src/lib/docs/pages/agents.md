---
title: For agents
description: How an AI agent or a script can read these docs, write a user's settings.json, and check it before the user saves it.
---

This page is for AI agents, scripts, and people who automate their setup. It says how to read the docs, and how to set up Hush for a user.

## Read the docs

- [/llms.txt](/llms.txt) lists every page, with its Markdown address.
- [/llms-full.txt](/llms-full.txt) has every page in one file.
- Every page is Markdown at its address plus `.md`: [/docs/settings.md](/docs/settings.md), [/docs/query-language.md](/docs/query-language.md)… The docs home is [/docs/index.md](/docs/index.md).

The reference tables (settings, keys, query words, menu items) are made from Hush's own source code when the site is built, so they match the version that runs.

## What an agent can do

Hush has no public API. Its API accepts only a signed-in browser session, and it may change at any time. So an agent sets Hush up **through the user**:

1. Write the user's settings as JSON (see below).
2. Give it to the user, who pastes it into **Settings → General → Edit settings.json** and chooses **Save**, or imports it as a file in **Settings → General → Settings file**.

Hush checks the JSON and shows an error if something is wrong; nothing is saved then. Everything about turns, pushes, sources, categories, tags, menus, and keys is in settings.json. The things that are not (appearance, push devices, feeds, a custom token) are listed in [settings.json](/docs/settings#what-is-not-in-settings-json).

## Write settings.json

- Write only what differs from the defaults. Leave out every setting that you do not change.
- **Saving replaces all settings.** Ask the user for their current settings.json first (they can copy it from the page), and change that. A file without their categories deletes their categories.
- `sources`, `tracked`, `categories`, `tags`, and the menus are lists: write the whole list. A `categories` list must keep the fallback category, `"other"`. `dash`, `menus`, and `swipe` are groups: write only the keys that you change.
- Leave `"v"` in `menus` as it is.
- Every key, type, default, and limit is in [settings.json](/docs/settings). The rules of categories and tags are queries (text): every word is in the [query language](/docs/query-language#words).

To make a settings file to import, put the settings in this wrapper:

```json
{ "hush": 2, "exportedAt": "2026-09-28T09:00:00.000Z", "settings": { "botsAreFyi": true } }
```

### Check it before the user saves it

Check these, or Hush refuses the file:

- Category and tag ids are 1 to 40 lower-case letters, digits, or dashes, and unique; names are 1 to 40 characters; at most 20 categories and 20 tags.
- Each category and tag has `color` (one of the [colors](/docs/settings#categories)) and `rule` (a query, as text, or `""` for none). Each category also has `description` (up to 200 characters, or `""`).
- `categories` has the fallback category `{ "id": "other", … }`. A category's `push` is `"inherit"`, `"on"`, or `"off"`.
- Rules use only the words and values of the [query language](/docs/query-language#words), such as `repo:acme/*`, `author:bots`, `type:pr`.
- Source ids are 1 to 40 lower-case letters, digits, or dashes; searches are 1 to 256 characters; at most 20 sources and 50 tracked items.
- Key names follow the [key format](/docs/settings#keys); command ids are in the [keybinds table](/docs/keybinds#all-shortcuts).
- `quietHours.timeZone` is an IANA time zone, and `from` and `to` are minutes (0 to 1439) that differ.
- `pushRepeat` is `"once"`, `"reason"`, or `"every"`. `clearNotifications` is `"open"`, `"item"`, or `"never"`.
- `pushDigestMinutes` is `null` or a whole number from 5 to 240. `pushLimit` is `null` or `{ "count", "minutes" }`: `count` is 1 to 50, and `minutes` is 5 to 240.

## Recipes

**“Put the web repositories in their own category, and never push bots' items.”**

```json settings
{
	"categories": [
		{
			"id": "web",
			"name": "Web",
			"color": "blue",
			"rule": "repo:acme/web,acme/website",
			"description": ""
		},
		{
			"id": "bots",
			"name": "Bots",
			"color": "gray",
			"rule": "author:bots",
			"description": "",
			"push": "off"
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	]
}
```

The first category whose rule matches wins, top to bottom. Items that no rule matches go to `"other"`.

**“Tag small pull requests, and the ones about the database.”**

```json settings
{
	"tags": [
		{ "id": "quick", "name": "Quick", "color": "green", "rule": "type:pr size:<50" },
		{
			"id": "database",
			"name": "Database",
			"color": "violet",
			"rule": "about:\"database migrations or schema changes\""
		}
	]
}
```

`about:` asks Jev, so it needs [smart decisions](/docs/settings#smartdecisions) on.

**“Quiet at night and on weekends in Berlin.”**

```json settings
{ "quietHours": { "from": 1260, "to": 480, "weekends": true, "timeZone": "Europe/Berlin" } }
```

**“Push less: one push each hour, and push an item again when its reason changes.”**

```json settings
{ "pushDigestMinutes": 60, "pushRepeat": "reason" }
```

**“Hide on D, Mute on Shift+D, and no key for Not my turn.”**

```json settings
{ "keys": { "dash.hide": ["d"], "dash.mute": ["Shift+d"], "dash.notNeeded": [] } }
```

**“Show PRs in the acme org only, and skip the everyone team.”**

```json settings
{ "dash": { "scope": "org:acme archived:false", "excludedTeams": ["acme/everyone"] } }
```

## Explain Hush to a user

When a user asks why an item is their turn, the answer is in [What is your turn](/docs/turns#what-is-your-turn) and the [turn reasons](/docs/pull-requests-and-issues#groups). The item's row also says it, with its turn reason (“CI failing”, “Review requested”).
