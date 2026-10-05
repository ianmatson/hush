---
title: For agents
description: How an AI agent or a script can read these docs, write a user's settings.json, and check it before the user saves it.
---

This page is for AI agents, scripts, and people who automate their setup. It says how to read the docs, and how to set up Hush for a user.

## Read the docs

- [/llms.txt](/llms.txt) lists every page, with its Markdown address.
- [/llms-full.txt](/llms-full.txt) has every page in one file.
- Every page is Markdown at its address plus `.md`: [/docs/settings.md](/docs/settings.md), [/docs/categories.md](/docs/categories.md)… The docs home is [/docs/index.md](/docs/index.md).

The reference tables (settings, keys, query words, menu items) are made from Hush's own source code when the site is built, so they match the version that runs.

## What an agent can do

Hush has no public API. Its API accepts only a signed-in browser session, and it may change at any time. So an agent sets Hush up **through the user**:

1. Write the user's settings as JSON (see below).
2. Give it to the user, who pastes it into **Settings → General → Edit settings.json** and chooses **Save**, or imports it as a file in **Settings → General → Settings file**.

Hush checks the JSON and shows an error if something is wrong; nothing is saved then. Everything about sorting, pushes, categories, tags, views, sources, menus, and keys is in settings.json. The things that are not (appearance, push devices, feeds, a custom token) are listed in [settings.json](/docs/settings#what-is-not-in-settings-json).

## Write settings.json

- Write only what differs from the defaults. Leave out every setting that you do not change.
- **Saving replaces all settings.** Ask the user for their current settings.json first (they can copy it from the page), and change that. A file without their categories puts back the default categories.
- `categories`, `tags`, `views`, `sources`, `tracked`, and the menus are lists: write the whole list. `dash`, `menus`, and `swipe` are groups: write only the keys that you change.
- Leave `"v"` in `menus` as it is.
- Every key, type, default, and limit is in [settings.json](/docs/settings). The rules of categories and tags, and the conditions of views, are queries (text): every word is in the [query language](/docs/query-language#words).

To make a settings file to import, put the settings in this wrapper:

```json
{ "hush": 2, "exportedAt": "2026-09-28T09:00:00.000Z", "settings": { "botsAreFyi": true } }
```

### Check it before the user saves it

Check these, or Hush refuses the file:

- There is no `rules` setting: Hush refuses it as unknown. Inbox rules are [categories](/docs/categories) now.
- `categories` keeps the category with the id `"other"`: it is the fallback. Up to 20 categories and 20 tags.
- Each category has `id` (1 to 40 lower-case letters, digits, or dashes; unique), `name` (up to 40 characters), `color` (`gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet`, or `pink`), `rule` (a query, or `""`), and `description` (up to 200 characters, or `""`). Tags have the same keys, without `description`.
- A category's `inbox` is `"auto"`, `"action"`, `"fyi"`, or `"muted"`; `push` is `"inherit"`, `"on"`, or `"off"`; `triage` is `"done"` or `"snooze"`. `triage: "snooze"` has `snoozeHours`, a whole number from 1 to 720.
- Queries (a category's or tag's `rule`, a view's `query`) use only the words and values of the [query language](/docs/query-language#words), such as `needs:fix-ci`, `event:review-requested`, `type:pr`. They cannot use `category:` or `tag:`. Up to 300 characters.
- View ids are 1 to 16 lower-case letters or digits, and unique; names are 1 to 40 characters; at most 12 views.
- Source ids are 1 to 40 lower-case letters, digits, or dashes; queries are 1 to 256 characters.
- Key names follow the [key format](/docs/settings#keys); command ids are in the [keybinds table](/docs/keybinds#all-shortcuts).
- `quietHours.timeZone` is an IANA time zone, and `from` and `to` are minutes (0 to 1439) that differ.
- `pushRepeat` is `"once"`, `"reason"`, or `"every"`. `clearNotifications` is `"open"`, `"item"`, or `"never"`.
- `pushDigestMinutes` is `null` or a whole number from 5 to 240. `pushLimit` is `null` or `{ "count", "minutes" }`: `count` is 1 to 50, and `minutes` is 5 to 240.

## Recipes

**“Only my repositories may need me.”** Make one category for your repositories, and set the fallback, Other, to FYI:

```json settings
{
	"categories": [
		{
			"id": "mine",
			"name": "My repos",
			"color": "blue",
			"rule": "repo:acme/web,acme/api",
			"description": ""
		},
		{
			"id": "other",
			"name": "Other",
			"color": "gray",
			"rule": "",
			"description": "",
			"inbox": "fyi"
		}
	]
}
```

A thread in acme/web or acme/api is in My repos, and Hush decides if it needs you. Every other thread is in Other, which is always FYI. This removes the default categories; keep them in the list to keep them. Jev chooses only among categories with a description, so here it chooses nothing. A saved view per project is another way: it adds a tab and hides nothing.

**“Push me only when someone reviews my PRs.”**

```json settings
{
	"pushAction": false,
	"categories": [
		{
			"id": "my-reviews",
			"name": "Reviews on my PRs",
			"color": "green",
			"rule": "type:pr event:you-opened needs:changes,merge",
			"description": "",
			"push": "on"
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	]
}
```

**“Quiet at night and on weekends in Berlin.”**

```json settings
{ "quietHours": { "from": 1260, "to": 480, "weekends": true, "timeZone": "Europe/Berlin" } }
```

**“Push less: one push each hour, and push an item again when its reason changes.”**

```json settings
{ "pushDigestMinutes": 60, "pushRepeat": "reason" }
```

**“Done on D, Mute on Shift+D, and no key for Snooze.”**

```json settings
{ "keys": { "inbox.done": ["d"], "inbox.mute": ["Shift+d"], "inbox.snooze": [] } }
```

**“Show PRs in the acme org only, and skip the everyone team.”**

```json settings
{ "dash": { "scope": "org:acme archived:false", "excludedTeams": ["acme/everyone"] } }
```

## Explain Hush to a user

When a user asks why a thread is in Needs you, the answer is in [What needs you](/docs/inbox#what-needs-you) and the [turn reasons](/docs/pull-requests-and-issues#groups). The thread's row also says it: its summary (“CI failed on your PR”), and “category: …” if the inbox settings of its category sorted it. On the Pull requests and Issues tabs, each row shows its category and tags.
