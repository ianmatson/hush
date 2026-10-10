---
title: Views
description: The tabs in the top bar. Each view shows the open pull requests and issues that its GitHub searches find.
---

A **view** is a tab in the top bar. It shows the open pull requests and issues that its [GitHub searches](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests) find, and the single items that you add to it. Hush starts with one view, **Mine**: the work that involves you.

{{ref:views}}

Add a view for work that does not mention you, such as a repository that you are responsible for, a label, or a project board:

| View        | Searches                                           |
| ----------- | -------------------------------------------------- |
| Website     | `repo:acme/website is:open`                        |
| Bugs        | `org:acme is:issue is:open label:bug`              |
| This sprint | `project:acme/12 status:"This week","In progress"` |

A view never mixes with another view: it shows only what its own searches find. An item can be in more than one view.

## Make a view

1. Choose **+** at the end of the top bar, or choose **Add view** in **Settings → Views**.
2. Give the view a name. It is the label of its tab.
3. Write one or more searches, as text or picked one by one. **Try on GitHub** opens the same search on GitHub, and Hush says how many results GitHub finds.
4. Choose **Save**.

## Searches

- `@me` is you. `@team` runs the search once for each team that you track. `team-review-requested:@team` is one search for all of them: Hush searches `review-requested:@me` and keeps the PRs that ask one of your tracked teams (it leaves out your own PRs).
- A search with `is:pr`, or a word that only pull requests have (such as `review-requested:` or `reviewed-by:`), finds pull requests. With `is:issue`, issues. With neither, both.
- Hush adds `archived:false` to each search, unless the search says `archived:`.
- A view has up to 5 searches. Hush keeps the 100 most recently updated results of each search.
- A search that names no person, team, repository, organization, or project looks at all of GitHub. Hush warns you, because it keeps only the newest 100 results.

### Project boards

A search can read a GitHub project board. Name the project with `project:` and one or more columns with `status:`:

`project:acme/12 status:"This week","In progress" no:assignee`

- Hush reads this search from the board, not with GitHub search. The rest of the search uses the [board's filter words](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects), such as `assignee:@me`, `no:assignee`, `label:bug`, and `-status:Done`.
- `acme/12` is the owner of the project and its number, from the project's address (`github.com/orgs/acme/projects/12`).
- Hush does not add `archived:false` to a board search.
- Draft items on the board are left out: they are not pull requests or issues.
- Hidden bots and others' drafts are not hidden here: someone put them on the board.
- It needs the `project` scope. A token from before Hush read boards does not have it: then a note above the list says so. See [project boards](/docs/github-access#project-boards).

A search with `project:` but no `status:` is a normal GitHub search: it finds every open item in the project, whatever its column.

### Teams

**Settings → Views → Teams** lists your teams. Turn off big teams (such as “everyone”) to cut noise. **Look up teams again** finds new teams at once; otherwise Hush looks every 6 hours.

## Single items

Under **Single items**, paste the address of a pull request or issue (or `owner/repo#123`). The view shows it while it is open, whatever its searches find. You can add up to 50 single items in all your views.

## In a view

- A view that can find both types has a switch: **Pull requests** and **Issues**, with a count each. {{key:dash.kind}} changes it. This browser remembers the choice for each view.
- The list groups the items by whose turn it is. See [Pull requests and issues](/docs/pull-requests-and-issues).
- The pencil button next to the switch opens the view in **Settings → Views**.
- The number on a tab counts the items in the view that are your turn.
- {{key:dash.view.1}} to {{key:dash.view.9}} open your first nine views.
- On a narrow window, views that do not fit go in **More**. On a phone, the top bar is one menu.

## Views and the inbox

The [inbox](/docs/inbox#what-comes-in) gets only the notifications about the pull requests and issues of your views. When the searches of all your views stop finding an item (for example, it was merged or closed, or a review request ended), Hush tracks it for 14 days more, so its last notifications still come in. When you change your views, Hush stops at once to track the items that no view finds now, and removes their notifications.

## Change or delete a view

In **Settings → Views**:

- Change a view's name, searches, and single items.
- Move a view up or down. The top bar shows the views in this order.
- Delete a view with the trash button. You keep at least one view.
- **Defaults** puts back the Mine view and removes the others. Nothing changes until you choose **Save**.

**Filters** in **Settings → Views** hide drafts that others opened ([`dash.hideOthersDrafts`](/docs/settings#dash-hideothersdrafts)) and PRs and issues that bots opened ([`dash.hideBots`](/docs/settings#dash-hidebots)), such as dependabot or a GitHub App. Both are on by default.

You can have up to 12 views. Each view can have an [Atom feed](/docs/feeds).

## In settings.json

Views are the [`views`](/docs/settings#views) setting:

```json settings
{
	"views": [
		{
			"id": "mine",
			"name": "Mine",
			"searches": ["is:pr is:open review-requested:@me", "is:open involves:@me"],
			"items": []
		},
		{
			"id": "website",
			"name": "Website",
			"searches": ["repo:acme/website is:open"],
			"items": ["acme/api#77"]
		}
	]
}
```

Category rules can test a view's name with `view:`: `view:Website`.
