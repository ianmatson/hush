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

Hush checks the JSON and shows an error if something is wrong; nothing is saved then. Everything about sorting, pushes, categories, views, sources, menus, and keys is in settings.json. The things that are not (appearance, push devices, feeds, a custom token) are listed in [settings.json](/docs/settings#what-is-not-in-settings-json).

## Write settings.json

- Write only what differs from the defaults. Leave out every setting that you do not change.
- **Saving replaces all settings.** Ask the user for their current settings.json first (they can copy it from the page), and change that. A file without their `categoryGroups` puts back the default Effort group.
- `categoryGroups`, `views`, `sources`, `tracked`, and the menus are lists: write the whole list. `dash`, `menus`, and `swipe` are groups: write only the keys that you change.
- Leave `"v"` in `menus` as it is.
- Every key, type, default, and limit is in [settings.json](/docs/settings). The rules of categories, and the conditions of views, are queries (text): every word is in the [query language](/docs/query-language#words).

To make a settings file to import, put the settings in this wrapper:

```json
{ "hush": 2, "exportedAt": "2026-09-28T09:00:00.000Z", "settings": { "botsAreFyi": true } }
```

### Check it before the user saves it

Check these, or Hush refuses the file:

- There are no `rules`, `categories`, or `tags` settings: Hush refuses them as unknown. Categories are in `categoryGroups`.
- `categoryGroups` has up to 10 groups. Each group has `id` (1 to 40 lower-case letters, digits, or dashes; unique), `name` (up to 40 characters), `multiple` (`false` for one category per item, `true` for any number), and `categories` (up to 20).
- Each category has `id` (1 to 40 lower-case letters, digits, or dashes; unique across all groups), `name` (up to 40 characters), `color` (`gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet`, or `pink`), `rule` (a query, or `""`), `description` (up to 200 characters, or `""`), and an optional `icon` (`"lucide:<name>"` or one emoji).
- Categories have no inbox or push settings. They mark items only; they do not change Needs you, FYI, Muted, or pushes.
- Queries (a category's `rule`, a view's `query`) use only the words and values of the [query language](/docs/query-language#words), such as `needs:fix-ci`, `event:review-requested`, `type:pr`. Up to 300 characters.
- Category rules look only at the PR or issue. They cannot use `category:`, and they must not use `event:`, `needs:`, or `in:`, which are about notifications. A view's `query` can use all of these words.
- View ids are 1 to 16 lower-case letters or digits, and unique; names are 1 to 40 characters; at most 12 views.
- Source ids are 1 to 40 lower-case letters, digits, or dashes; queries are 1 to 256 characters.
- Key names follow the [key format](/docs/settings#keys); command ids are in the [keybinds table](/docs/keybinds#all-shortcuts).
- `quietHours.timeZone` is an IANA time zone, and `from` and `to` are minutes (0 to 1439) that differ.
- `pushRepeat` is `"once"`, `"reason"`, or `"every"`. `clearNotifications` is `"open"`, `"item"`, or `"never"`.
- `pushDigestMinutes` is `null` or a whole number from 5 to 240. `pushLimit` is `null` or `{ "count", "minutes" }`: `count` is 1 to 50, and `minutes` is 5 to 240.

## Recipes

**“Mark what is about security, wherever it is.”** Add a group with any number per item, next to the default Effort group:

```json settings
{
	"categoryGroups": [
		{
			"id": "effort",
			"name": "Effort",
			"multiple": false,
			"categories": [
				{
					"id": "low-effort",
					"name": "Low",
					"color": "green",
					"icon": "lucide:signal-low",
					"rule": "",
					"description": "A pull request that takes minutes to review, or an issue that takes an hour or less to do"
				},
				{
					"id": "medium-effort",
					"name": "Medium",
					"color": "amber",
					"icon": "lucide:signal-medium",
					"rule": "",
					"description": "A pull request that takes up to an hour to review, or an issue that takes up to a day to do"
				},
				{
					"id": "high-effort",
					"name": "High",
					"color": "red",
					"icon": "lucide:signal-high",
					"rule": "",
					"description": "A pull request that takes more than an hour to review, or an issue that takes more than a day to do"
				}
			]
		},
		{
			"id": "topics",
			"name": "Topics",
			"multiple": true,
			"categories": [
				{
					"id": "security",
					"name": "Security",
					"color": "red",
					"icon": "lucide:shield",
					"rule": "label:security",
					"description": "Vulnerabilities, secrets, permissions, or authentication"
				}
			]
		}
	]
}
```

An item with the `security` label is in Security. Jev also puts an item there when its text fits the description. A list without the Effort group removes it.

**“A tab for my repositories.”** A notification view adds a tab and hides nothing:

```json settings
{
	"views": [
		{ "id": "mine", "name": "My repos", "base": "inbox", "query": "repo:acme/web,acme/api" }
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

When a user asks why a thread is in Needs you, the answer is in [What needs you](/docs/inbox#what-needs-you) and the [turn reasons](/docs/pull-requests-and-issues#groups). The thread's row also says it: its summary (“CI failed on your PR”). Its category icons are those of its PR or issue; categories do not change the list. On the Pull requests and Issues tabs, each row shows its categories too.

When a user asks why a notification is missing, see [What comes in](/docs/inbox#what-comes-in): Hush keeps only the notifications about the PRs and issues that the user's sources find or that the user tracks.
