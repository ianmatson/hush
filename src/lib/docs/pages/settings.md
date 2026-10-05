---
title: settings.json
description: Every Hush setting in one JSON file, what each one controls, its type and default, and how the file is checked and saved.
---

All of your Hush settings are one JSON object. The settings pages edit parts of it; **settings.json** shows all of it, also the settings that no page shows. You can edit it by hand, export it to a file, import a file, or give it to an agent to write.

Open it in **Settings → General → Edit settings.json** ([app.hush-gh.com/settings/json](https://app.hush-gh.com/settings/json)).

## How it works

- **It has only your changes.** A setting that you did not change is not in the file; it uses its default. A new default in Hush then applies to you too.
- **Remove a key to go back to its default.**
- **Save replaces all your settings.** A setting that is not in the file goes back to its default. {{key:editor.save}} saves.
- **Hush checks the whole file first.** If one value is wrong, it shows the error, such as `"Website": unknown colour.`, and saves nothing. Unknown keys are errors too, also `rules`: inbox rules are now [categories](/docs/categories).
- **`dash`, `menus`, and `swipe` are groups.** Write only the keys that you change: `{ "dash": { "staleDays": 5 } }` keeps the other `dash` defaults. A list, such as `categories` or `sources`, is always replaced as a whole.
- **Changes apply at once**, on every device. A change to `categories`, `tags`, `botsAreFyi`, `teamReviewsAreAction`, or `reviewResolution` sorts your stored threads and items again.

A complete example:

```json settings
{
	"pushFyi": false,
	"quietHours": { "from": 1320, "to": 420, "weekends": true, "timeZone": "America/New_York" },
	"reviewResolution": "any_review",
	"teamReviewsAreAction": true,
	"categories": [
		{
			"id": "website",
			"name": "Website",
			"color": "blue",
			"rule": "repo:acme/website",
			"description": "",
			"inbox": "fyi"
		},
		{
			"id": "renovate",
			"name": "Renovate",
			"color": "gray",
			"rule": "author:renovate*",
			"description": "",
			"inbox": "muted"
		},
		{
			"id": "alice",
			"name": "From Alice",
			"color": "pink",
			"rule": "from:alice",
			"description": "",
			"push": "on"
		},
		{ "id": "other", "name": "Other", "color": "gray", "rule": "", "description": "" }
	],
	"tags": [{ "id": "quick", "name": "Quick", "color": "green", "rule": "type:pr size:<50" }],
	"views": [{ "id": "web", "name": "Web", "base": "inbox", "query": "repo:acme/web-*" }],
	"dash": {
		"scope": "org:acme archived:false",
		"excludedTeams": ["acme/everyone"],
		"staleDays": 5
	},
	"keys": { "inbox.done": ["d"] }
}
```

### What is not in settings.json

These are not settings of your account, so they are not in the file:

- **This browser only:** the mode and theme, the start page, the tab title and icon counts, the closed groups on the Pull requests and Issues tabs, unsent comments, and notes that you chose “Don't show again” for.
- **Your data:** push devices, feeds, and what you did to threads and items (Done, Snooze, Mute, hidden and moved items).
- **Your GitHub access:** the custom token, if any.

## Settings file

**Settings → General → Settings file** exports your settings to a file, and imports a file. Use it to keep a copy, to move to another account, or to share your categories.

The file is your settings.json in a small wrapper:

```json
{
	"hush": 2,
	"exportedAt": "2026-09-28T09:00:00.000Z",
	"settings": { "botsAreFyi": false, "dash": { "staleDays": 5 } }
}
```

- `hush` is the file format version: `2`. A version `1` file (conditions as JSON objects) still imports: Hush writes its conditions as queries. A file with inbox `rules` imports too: Hush changes them into categories, the same way it changed your own rules (see [Inbox rules from before](/docs/categories#inbox-rules-from-before)).
- `settings` has only the changes, the same as settings.json.
- **Import replaces all your settings**, like Save in settings.json. Hush asks first, and says how many categories and views the file has. Settings that Hush no longer has are left out.

{{ref:settings}}
