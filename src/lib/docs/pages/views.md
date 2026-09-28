---
title: Saved views
description: Extra inbox tabs that show only the threads you choose.
---

A saved view is an inbox tab with only the threads that match its conditions: one project, one team's repositories, broken CI, threads from one person. It does not move threads: a thread in a view is still in its own list (Needs you, FYI…), and Done, Snooze, and Mute work the same way there.

## Make a view

- Type a [filter](/docs/inbox#filter), such as `repo:acme/web-* needs:review`, and choose the bookmark button at the end of the box: **Save this filter as a view (a new tab)**.
- Or choose **+** after the tabs: **New view**.

In the view editor:

- **Name**: the tab's label, up to 40 characters.
- **Show threads from**: the base list. Needs you + FYI, Needs you, FYI, Snoozed, or Done.
- **Only threads where**: the conditions, as a [query](/docs/query-language) or one by one. They are the same conditions as [rules](/docs/rules#conditions). No conditions: the view shows every thread of its base.

Choose **Save view**. The new tab opens, with its count.

## Change a view

- Open the view's tab and choose the pencil button, **Edit view**. **Delete view** is in the editor.
- **Settings → Inbox → Views and feeds** lists your views: drag them to change their order, or edit or delete them there.
- Keys {{key:inbox.view.6}} to {{key:inbox.view.9}} open your first four views.

You can have up to 12 views. A view can have an [Atom feed](/docs/feeds).

## In settings.json

Views are the [`views`](/docs/settings#views) setting:

```json settings
{
	"views": [
		{
			"id": "webreviews",
			"name": "Web reviews",
			"base": "action",
			"when": { "repo": "acme/web-*", "kind": ["review"] }
		},
		{ "id": "alice", "name": "From Alice", "base": "inbox", "when": { "by": "alice" } }
	]
}
```

In a view, `in:` (`category`) is the thread's list now, after your rules. In a rule, it is where Hush's defaults put it.
