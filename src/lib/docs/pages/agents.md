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

Hush checks the JSON and shows an error if something is wrong; nothing is saved then. Everything about views, sorting, pushes, categories, menus, and keys is in settings.json. The things that are not (appearance, push devices, feeds, a custom token) are listed in [settings.json](/docs/settings#what-is-not-in-settings-json).

## Write settings.json

- Write only what differs from the defaults. Leave out every setting that you do not change.
- **Saving replaces all settings.** Ask the user for their current settings.json first (they can copy it from the page), and change that. A file without their `categoryGroups` puts back the default Effort and Impact groups.
- `categoryGroups`, `views`, and the menus are lists: write the whole list. `dash`, `menus`, and `swipe` are groups: write only the keys that you change.
- Leave `"v"` in `menus` as it is.
- Every key, type, default, and limit is in [settings.json](/docs/settings). The rules of categories, and the conditions of views, are queries (text): every word is in the [query language](/docs/query-language#words).

To make a settings file to import, put the settings in this wrapper:

```json
{ "hush": 2, "exportedAt": "2026-09-28T09:00:00.000Z", "settings": { "botsAreFyi": true } }
```

### Check it before the user saves it

Check these, or Hush refuses the file:

- There are no `rules`, `categories`, or `tags` settings: Hush refuses them as unknown. Categories are in `categoryGroups`.
- `categoryGroups` has up to 10 groups. Each group has `id` (1 to 40 lower-case letters, digits, or dashes; unique), `name` (up to 40 characters), and `categories` (up to 20). Each item gets one category from each group, or none (“Not sorted”).
- Each category has `id` (1 to 40 lower-case letters, digits, or dashes; unique across all groups), `name` (up to 40 characters), `color` (`gray`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet`, or `pink`), `rule` (a query, or `""`), `description` (up to 200 characters, or `""`), and an optional `icon` (`"lucide:<name>"` or one emoji).
- Categories have no inbox or push settings. They mark items only; they do not change Needs you, FYI, Muted, or pushes.
- A category's `rule` uses only the words and values of the [query language](/docs/query-language#words), such as `repo:acme/*`, `label:bug`, `type:pr`. Up to 300 characters.
- Category rules look only at the PR or issue. They cannot use `category:`, and they must not use `event:`, `needs:`, or `in:`, which are about notifications.
- `views` has 1 to 12 views. Each has `id` (1 to 40 lower-case letters, digits, or dashes; unique), `name` (1 to 40 characters), `searches` (up to 5 GitHub searches of 1 to 256 characters), and `groupBy` (`none`, `role`, `status`, `repo`, `author`, `label`, `assignee`, `category:<group id>`, or `project:<owner>/<number>` for the Status of a GitHub project), and optionally `pushNew` (`true` to push its new items). A view needs at least one search. The searches are GitHub search syntax, not the query language.
- Key names follow the [key format](/docs/settings#keys); command ids are in the [keybinds table](/docs/keybinds#all-shortcuts).
- `quietHours.timeZone` is an IANA time zone, and `from` and `to` are minutes (0 to 1439) that differ.
- `pushRepeat` is `"once"`, `"reason"`, or `"every"`. `clearNotifications` is `"open"`, `"item"`, or `"never"`.
- `pushDigestMinutes` is `null` or a whole number from 5 to 240. `pushLimit` is `null` or `{ "count", "minutes" }`: `count` is 1 to 50, and `minutes` is 5 to 240.

## Recipes

**“Mark what is about security, wherever it is.”** Add a Security group next to the default Effort and Impact groups. Its one category asks Jev with `about:` in its rule, so Jev answers yes or no. A description would not work here: with a description, Jev chooses between two or more categories of the group. Items that are not about security are Not sorted in this group:

```json settings
{
	"categoryGroups": [
		{
			"id": "effort",
			"name": "Effort",
			"categories": [
				{
					"id": "low-effort",
					"name": "Low",
					"color": "green",
					"icon": "lucide:timer",
					"rule": "",
					"description": "A pull request that takes minutes to review, or an issue that takes an hour or less to do"
				},
				{
					"id": "medium-effort",
					"name": "Medium",
					"color": "amber",
					"icon": "lucide:clock",
					"rule": "",
					"description": "A pull request that takes up to an hour to review, or an issue that takes up to a day to do"
				},
				{
					"id": "high-effort",
					"name": "High",
					"color": "red",
					"icon": "lucide:calendar-clock",
					"rule": "",
					"description": "A pull request that takes more than an hour to review, or an issue that takes more than a day to do"
				}
			]
		},
		{
			"id": "impact",
			"name": "Impact",
			"categories": [
				{
					"id": "low-impact",
					"name": "Low",
					"color": "gray",
					"icon": "lucide:minus",
					"rule": "",
					"description": "A fix or feature that few people notice, such as a small edge case, internal cleanup, or a minor tweak"
				},
				{
					"id": "medium-impact",
					"name": "Medium",
					"color": "blue",
					"icon": "lucide:chevron-up",
					"rule": "",
					"description": "A fix or feature that some users or teams notice, such as a bug in one workflow or an improvement to one part of the product"
				},
				{
					"id": "high-impact",
					"name": "High",
					"color": "violet",
					"icon": "lucide:chevrons-up",
					"rule": "",
					"description": "A fix or feature that many users notice, such as an outage, data loss, a security hole, a broken core flow, or a major new capability"
				}
			]
		},
		{
			"id": "security",
			"name": "Security",
			"categories": [
				{
					"id": "security-related",
					"name": "Security",
					"color": "red",
					"icon": "lucide:shield",
					"rule": "label:security OR about:\"vulnerabilities, secrets, permissions, or authentication\"",
					"description": ""
				}
			]
		}
	]
}
```

An item with the `security` label is in Security. Jev also puts an item there when it is about vulnerabilities, secrets, permissions, or authentication. A list without the Effort or Impact group removes that group.

**“A tab for my repositories.”** Add a view next to the default Mine view:

```json settings
{
	"views": [
		{
			"id": "mine",
			"name": "Mine",
			"searches": [
				"is:pr is:open review-requested:@me",
				"is:open involves:@me",
				"is:pr is:open reviewed-by:@me -author:@me"
			],
			"groupBy": "role"
		},
		{
			"id": "my-repos",
			"name": "My repos",
			"searches": ["repo:acme/web is:open", "repo:acme/api is:open"],
			"groupBy": "status"
		}
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

**“Skip the everyone team in @team searches.”**

```json settings
{ "dash": { "excludedTeams": ["acme/everyone"] } }
```

## Explain Hush to a user

When a user asks why a thread is in Needs you, the answer is in [What needs you](/docs/inbox#what-needs-you) and the [turn reasons](/docs/pull-requests-and-issues#order-and-reasons). The thread's row also says it: its summary (“CI failed on your PR”). Its category icons are those of its PR or issue; categories do not change the list. In a view, each row shows its categories too.

When a user asks why a notification is missing, see [What comes in](/docs/inbox#what-comes-in): Hush keeps only the notifications about the PRs and issues of the user's views.
