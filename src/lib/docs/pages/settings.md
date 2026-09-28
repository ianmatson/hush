---
title: settings.json
description: Every Hush setting in one JSON file, what each one controls, its type and default, and how the file is checked and saved.
---

All of your Hush settings are one JSON object. The settings pages edit parts of it; **settings.json** shows all of it, also the settings that no page shows. You can edit it by hand, export it to a file, import a file, or give it to an agent to write.

Open it in **Settings → Account → Settings file → Edit settings.json**, or with the **settings.json** button in **Settings → Advanced** ([app.hush-gh.com/settings/json](https://app.hush-gh.com/settings/json)).

## How it works

- **It has only your changes.** A setting that you did not change is not in the file; it uses its default. A new default in Hush then applies to you too.
- **Remove a key to go back to its default.**
- **Save replaces all your settings.** A setting that is not in the file goes back to its default. {{key:editor.save}} saves.
- **Hush checks the whole file first.** If one value is wrong, it shows the error, such as `Rule 2: "then" needs lane, push, mute, or snoozeHours.`, and saves nothing. Unknown keys are errors too.
- **A list is always replaced as a whole**: `rules`, `searches`, `saved`, `excludedTeams`, and `menu`. `keys` and `quietHours` are objects: write all of their keys that you want.
- **Changes apply at once**, on every device. A change to `rules`, `botsAreUpdates`, `teamReviewsAreMine`, or `reviewResolution` places your stored items again.

A complete example:

```json settings
{
	"teamReviewsAreMine": true,
	"reviewResolution": "any_review",
	"quietHours": { "from": 1320, "to": 420, "weekends": true, "timeZone": "America/New_York" },
	"rules": [
		{ "name": "Website is updates", "when": "repo:acme/website", "then": { "lane": "updates" } },
		{ "name": "Mute renovate", "when": "author:renovate*", "then": { "mute": true } },
		{ "name": "Alice is my turn", "when": "from:alice", "then": { "lane": "turn", "push": true } }
	],
	"saved": [{ "id": "web", "name": "Web", "query": "repo:acme/web-*" }],
	"searchScope": "org:acme archived:false",
	"excludedTeams": ["acme/everyone"],
	"staleDays": 5,
	"keys": { "item.done": ["d"] }
}
```

### What is not in settings.json

These are not settings of your account, so they are not in the file:

- **This browser only:** the mode and theme, the tab title and icon counts, and notes that you chose “Don't show again” for.
- **Your data:** push devices, feeds, and what you did to items (Done, Snooze, Mute, Not my turn, It is my turn).
- **Your GitHub access:** the custom token, if any.

## Settings file

**Settings → Account → Settings file** exports your settings to a file, and imports a file. Use it to keep a copy, to move to another account, or to share your rules.

The file is your settings.json in a small wrapper:

```json
{
	"hush": 2,
	"exportedAt": "2026-09-28T09:00:00.000Z",
	"settings": { "rules": [{ "when": "repo:acme/website", "then": { "lane": "updates" } }] }
}
```

- `hush` is the file format version: `2`. Hush does not import files of version 1, from before the lanes.
- `settings` has only the changes, the same as settings.json.
- **Import replaces all your settings**, like Save in settings.json. Hush asks first, and says how many rules and saved searches the file has. Settings that Hush no longer has are left out.

{{ref:settings}}
