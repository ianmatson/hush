---
title: Notification views
description: Extra inbox tabs that show only the notifications you choose.
---

A notification view is an inbox tab with only the notification threads that match its conditions: one project, one team's repositories, one category, threads from one person. It filters notifications only. It does not move threads: a thread in a view is still in its own list (Needs you, FYI…), and Done, Snooze, and Mute work the same way there.

## Make a view

- Type a [filter](/docs/inbox#filter), such as `repo:acme/web-* needs:review`, and choose the bookmark button at the end of the box: **Save this filter as a notification view (a new tab)**.
- Or choose **+** after the tabs: **New notification view**.

In the view editor:

- **Name**: the tab's label, up to 40 characters.
- **Show threads from**: the base list. Needs you + FYI, Needs you, FYI, Snoozed, or Done.
- **Only threads where**: a [query](/docs/query-language), as text or picked one by one. It is the same language as the rules of [categories](/docs/categories#rules). No query: the view shows every thread of its base.

`category:` works in a view. It matches the categories of the thread's PR or issue: `category:high-effort` shows the notifications about items with high effort.

Choose **Save view**. The new tab opens, with its count.

## Change a view

- Open the view's tab and choose the pencil button, **Edit notification view**. **Delete view** is in the editor.
- **Settings → Inbox → Views and feeds** lists your notification views: drag them to change their order, or edit or delete them there.
- Keys {{key:inbox.view.6}} to {{key:inbox.view.9}} open your first four views.

You can have up to 12 notification views. A view can have an [Atom feed](/docs/feeds).

## In settings.json

Notification views are the [`views`](/docs/settings#views) setting:

```json settings
{
	"views": [
		{
			"id": "webreviews",
			"name": "Web reviews",
			"base": "action",
			"query": "repo:acme/web-* needs:review"
		},
		{ "id": "alice", "name": "From Alice", "base": "inbox", "query": "from:alice" },
		{ "id": "big", "name": "Big work", "base": "inbox", "query": "category:high-effort" }
	]
}
```

In a view, `in:` is the thread's list now.
