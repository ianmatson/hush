---
title: Search and saved searches
description: Find any item Hush has, with words or the query language, and keep a search as a tab.
---

**Search** ({{key:list.search}}) finds every item that Hush has: the items in the three lanes, and the items that you marked Done, snoozed, or muted. Type words, or [query words](/docs/query-language):

```query
repo:acme/* needs:review -author:bots
```

Plain words must all be in the title, the repository, or the author. Suggestions show while you type. When a query has an error, the message shows under the box, and the part with the error is left out.

Under the box, choose what to search:

| Choice         | Shows                                                     |
| -------------- | --------------------------------------------------------- |
| **Everything** | Every item that Hush has, also done, snoozed, and muted.  |
| **Done**       | What you marked Done, or what Hush finished for you.      |
| **Snoozed**    | What you snoozed. It comes back at the time or the event. |
| **Muted**      | What you muted, or what a rule mutes.                     |

The keys, the menu, and the [peek](/docs/peek) work the same as in the lanes. To bring an item back, choose **Move back** ({{key:item.restore}}).

`in:` finds the items of one lane: `in:waiting repo:acme/web`. `is:done`, `is:snoozed`, and `is:muted` are the same as the choices, in a query.

## Saved searches

A saved search is a tab after the lanes, with only the items that match its query: one project, one team's repositories, broken CI, items from one person. It does not move items: an item in a saved search is still in its own lane, and Done, Snooze, and Mute work the same way there.

- Type a query and choose **Save as a tab**. Give it a name, up to 40 characters, and choose **Save**.
- Open the tab and choose **Edit** to change its name or query, or to **Delete** it.
- Keys {{key:nav.saved.1}} to {{key:nav.saved.6}} open your first six saved searches.

You can have up to 12 saved searches. A saved search can have an [Atom feed](/docs/feeds).

### Examples

| Query                          | Shows                                   |
| ------------------------------ | --------------------------------------- |
| `repo:acme/web-* needs:review` | Reviews in the web repositories.        |
| `in:turn needs:fix-ci,changes` | Your PRs that need a fix.               |
| `from:alice`                   | Items where Alice did the newest thing. |
| `in:waiting type:pr`           | PRs that wait on others.                |
| `is:done repo:acme/api`        | What you finished in acme/api.          |

### In settings.json

Saved searches are the [`saved`](/docs/settings#saved) setting:

```json settings
{
	"saved": [
		{ "id": "web", "name": "Web reviews", "query": "repo:acme/web-* needs:review" },
		{ "id": "alice", "name": "From Alice", "query": "from:alice" }
	]
}
```
