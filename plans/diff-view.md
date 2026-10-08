# Plan: Diff view and full-page view

## Goals

1. Read a pull request's changes in Hush, with the same keyboard flow as the lists.
2. Show only what changed since your last review: the next step after "new commits after your review need you".
3. Review line by line in Hush: inline comments, suggestions, and a pending review that you submit with approve or request changes.

## Decisions

- **The full page is an "expand" option.** The list and the peek stay the main flow. The peek gets an expand button and a key, and the full page has the diff.
- **Inline comments are in scope** (phase 6). Hush must be able to replace GitHub's "Files changed" tab.

## Facts that drive the design

- **Workers free plan: about 10 ms of CPU for each request.** The Worker only passes the diff through. The browser parses it.
- **Diffs are not stored in the Durable Object.** They are large and change on each push. A commit never changes, so the cache key is the head commit (`headOid`): the Cache API at the edge, and TanStack Query in the browser.
- **GitHub limits:** `GET /repos/{o}/{r}/pulls/{n}/files` gives one patch for each file, 100 files per page, up to 3,000 files. It leaves out `patch` for very large and binary files: the UI shows "too large, open on GitHub". The raw `.diff` media type stops at about 20k lines, so Hush does not use it.
- **The peek is 28–56rem wide** (`--peek-w`). A side-by-side diff does not fit, so the diff is on the full page only. The peek shows the file list with +/− counts.
- **Syntax highlighting is heavy.** Shiki loads lazily, and each theme in `themes.css` needs token colors.
- **AGENTS.md needs screenshots for each changed area.** Each phase is its own PR.

## Phase 1: Full-page view

- Route `/:owner/:repo/pull/:number` and `/:owner/:repo/issues/:number`, the same paths as GitHub: change `github.com` to `app.hush-gh.com` in an address and it opens in Hush.
- The page shows the peek's contents in a wider column, and the actions on GitHub in a bottom bar.
- An expand button in the peek header, and the key `f` (`list.fullPage`) on the lists, the context menus, and the palette.
- `Escape` goes back to the list. The peek is still open on the same item there.
- Docs: the peek page gets a "Full page" part.

## Phase 2: Read-only diff

- `GET /api/diff/:owner/:repo/:number?head=<oid>`: the files endpoint, all pages, as one JSON answer. Cached at the edge by `headOid`.
- `src/lib/shared/diff.ts`: a unified-diff hunk parser, with tests.
- The full page gets two tabs: **Conversation** and **Files**.
- Files tab: a file tree, a unified view, folded large, binary, renamed, and generated files (`linguist-generated`, lock files).
- Keys: next and previous file, next and previous hunk, fold a file.
- The peek: a "Files" part with each file's +/− counts. A click opens the file on the full page.

## Phase 3: Since your last review, and viewed files

- "Since your review": the compare API from your last review's commit to the head commit. A force push breaks the base: then Hush says so and shows the full diff.
- Viewed files: GitHub's `viewerViewedState` and the `markFileAsViewed` / `unmarkFileAsViewed` mutations, so "viewed" is the same in Hush and GitHub.

## Phase 4: Syntax highlighting and split view

- Shiki, loaded lazily with the languages that the diff needs.
- Token colors for each theme.
- A split view on wide screens; the unified view stays the default on narrow screens.

## Phase 5: Existing review threads

- GraphQL `reviewThreads`: path, line, start line, side, outdated, resolved, comments.
- Threads show at their lines. Outdated threads show in a list at the top of their file.
- Reply, resolve, and unresolve.

## Phase 6: Write inline comments

- Comment on one line or a range (drag or Shift+click).
- Suggestions (` ```suggestion ` blocks), with a preview.
- A pending review: comments wait until you submit with comment, approve, or request changes. GraphQL `addPullRequestReview`, `addPullRequestReviewThread`, `submitPullRequestReview`.
- The comment box drafts stay in the browser, as the comment box does now.

## Sizes

| Phase | Size            |
| ----- | --------------- |
| 1     | S–M, 2–3 days   |
| 2     | M, 4–6 days     |
| 3     | S–M, 2–3 days   |
| 4     | M, 3–4 days     |
| 5     | M, about 3 days |
| 6     | L, 1–2 weeks    |

The biggest unknowns: speed on very large PRs (virtual rendering may be necessary), and line anchoring after force pushes in phase 6.
