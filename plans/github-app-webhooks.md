# Webhook updates from a GitHub App

Status: parked, 2026-10-22. Redo on top of plans/core-model.md. Runtime checks are still open: DO RPC cancellation, `check_suite` delivery, and the cost figures.

## Goal

Org owners can install a **Hush GitHub App** on an org (or a personal account). Then Hush learns about changes to tracked pull requests and issues in that org in seconds, from webhooks. Polling stays exactly as it is, so views that search outside the installed orgs keep working, and polling stays the safety net for everything webhooks miss.

Webhooks improve two weak points of polling (README → Known limits):

1. Latency: a notification arrives at the next poll (5 or 15 minutes).
2. Facts with no notification (CI finished, a review on someone else's PR, a merge by someone else) wait for the view search or the one-hour details refresh (`DETAILS_TTL`, `needsDetails` in `worker/github.ts`).

## Non-goals

- Sign-in does not change. The Notifications API does not accept GitHub App tokens, so the OAuth app stays the sign-in and each user's reader.
- Hush does not store webhook payloads, and does not build facts from payloads.
- Installing the app does **not** give a user's OAuth token access to an org. That is still the OAuth app approval.
- No change to the poll schedule, the alarm, or notification `ingest`.
- Webhooks do not recompute GitHub-search membership of views (see "What webhooks do not cover").

## Core decision: a webhook is a hint, not data

A webhook says "item `owner/repo#N` changed". Each user who tracks that item has their Durable Object (DO) read it again **with their own token**, through the existing `record()` path, as a notification does today.

- Permission isolation: each read uses a token that the user owns. A user who lost access gets `deletedOrNoAccess`. (Shared installation-token reads could save API calls, but need their own authorization design. Not in this plan.)
- `record()` already writes only changed facts, pushes each fact once, patches dashboards, and sends live messages.

## Architecture

```
GitHub ──POST /api/github/webhook──▶ Worker
  1. verify X-Hub-Signature-256 on the raw body (HMAC-SHA256, constant time) → else 401
  2. installation*, repository renamed/transferred/deleted → D1 registry
  3. item events → webhookHintsOf(event, payload) (pure, fixture-tested)
  4. route: one D1 query → group by user → one RPC per user with all of that user's hints
  5. answer 202; the RPCs run in waitUntil
Poller DO: webhookHints(hints)
  lifecycle check → tracked hints: batched read under exclusive() → record()
                  → discovery hints: rebuildFor-style path (5-minute gap)
```

No alarm, no `pollGap`, no `schedule()` change. The RPC does the work and returns.

### Events and permissions

App permissions, all **read**: Metadata, Pull requests, Issues, Checks.

| Event                         | Actions                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `pull_request`                | all, including `synchronize`                                     |
| `pull_request_review`         | submitted, edited, dismissed                                     |
| `pull_request_review_comment` | created, edited, deleted                                         |
| `pull_request_review_thread`  | resolved, unresolved                                             |
| `issues`                      | all                                                              |
| `issue_comment`               | created, edited, deleted (`issue.pull_request` says PR or issue) |
| `check_suite`                 | completed (each PR in `pull_requests[]`)                         |
| `installation*`, `repository` | registry only (`repository`: renamed, transferred, deleted)      |

Not in v1, on purpose:

- `check_run`: one event per job, too many. So a "CI failed" push comes when the **suite** completes, not at the first failed job, and a re-run's start is not seen at once.
- `status` (legacy commit statuses): only a SHA; needs a SHA → PR map.
- `workflow_run`: duplicates `check_suite` for Actions and needs another permission.
- Fork PRs: `check_suite.pull_requests` is empty. They keep the polling path.

Sandbox check before the CI part ships: an app with Checks read gets `check_suite.completed` for suites that GitHub Actions and other apps create.

### Identities

- **Item route identity:** `item:` + `lower(owner/repo)` + `#` + number. `subjectKey()` keeps GitHub's case, so the DO maps a hint to its local key with a case-insensitive lookup in `tracked_items` (`WHERE lower(key) IN …`; the table holds hundreds of rows, so a scan is fine).
- **Repository rename or transfer:** item keys change only when the next view search returns the new name (normally 15 minutes). Until then, events for that repository route to nobody, and polling covers them. The `repository` event updates the registry at once.
- **Users:** payload user ids. `users.id` in D1 is the GitHub user id, so no login lookup.
- **Teams:** GitHub team ids. `fetchTeams` adds `databaseId` to its GraphQL query; `TeamDTO` and the `teams` cache get `id`.

### Hints

```ts
interface WebhookHint {
	routeKey: string; // 'owner/repo#N', lower-case
	kind: DashKind;
	discovery: DiscoveryReason | null;
	userIds: number[]; // only for 'review-requested' and 'assigned'
	teamIds: number[]; // only for 'review-requested'
}
type DiscoveryReason = 'opened' | 'review-requested' | 'assigned';
```

`opened` covers `opened`, `reopened`, `ready_for_review`, and `transferred`.

### Routing (D1)

```sql
CREATE TABLE webhook_routes (
  target TEXT NOT NULL,      -- 'item:owner/repo#n' | 'repo:owner/repo' | 'team:<id>'
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (target, user_id)
);
CREATE INDEX webhook_routes_user ON webhook_routes(user_id);
CREATE TABLE webhook_route_owners (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refreshed_at INTEGER NOT NULL
);
```

A user's targets:

- `item:` each key in `tracked_items`.
- `repo:` each repository that a view search names with a `repo:` qualifier. Used only for `opened`.
- `team:` each of the user's team ids. Used only for `review-requested`.

Direct user routing (`users WHERE id IN userIds`) runs only for `review-requested` and `assigned`.

The Worker's lookup for one delivery is one query on primary keys. The Worker then **groups rows by user**: one RPC per user carries all that user's hints, whatever target matched.

Limits:

- `MAX_ROUTED_USERS = 50` per delivery. Over that, the Worker sends to the first 50 by `user_id` and logs the event. With two users this never happens; the log says when it starts to matter. This is an accepted risk, not a fair-share design.
- `WEBHOOK_LIMIT` rate-limit binding: 60 hints a minute per user. Over → drop (polling covers it). The binding is approximate and local to each Cloudflare location, so it limits storms, not the daily budget.

### Route sync (DO → D1)

The DO owns its rows and keeps a copy of what D1 has, in its own SQLite:

```sql
CREATE TABLE webhook_routes_sent (target TEXT PRIMARY KEY);  -- Poller schema 20
```

Contract:

1. After each **complete** dashboard build, and after `teams()` refreshes: compute the target set. Diff it with `webhook_routes_sent`.
2. If there is a difference, apply it as one D1 batch of idempotent statements (`INSERT OR IGNORE`, `DELETE … WHERE target = ? AND user_id = ?`).
3. Only after the batch succeeds, update `webhook_routes_sent` in one transaction. A failed batch changes nothing; the next build tries again.
4. When polling stops for any reason — `paused` in `schedule()`, `fail(…, { stop: true })`, `stop()`: first the local part, which cannot fail (increment the generation, clear the pending set, clear `webhook_routes_sent`); then a best-effort `DELETE FROM webhook_routes WHERE user_id = ?`. A D1 error is logged and never thrown, so `stop()` always reaches `deleteAll()`.
5. Route sync and route deletion go through their own queue (`routeWrites`, a promise chain like `exclusive()`), which **never** calls `exclusive()`. Builds, `schedule()`, `fail()`, and `stop()` can run inside the `exclusive()` lock that `cycle()` holds (a direct `stop()` RPC does not), so a second `exclusive()` there would deadlock. Tests cover both call paths. The sync checks the generation and `stopped`/`paused` before its D1 batch and again before it updates `webhook_routes_sent`. So an older sync cannot write rows again after a stop.
6. A D1 row `webhook_route_owners (user_id PRIMARY KEY, refreshed_at)` is the lease for a user's routes. The DO writes it in the same D1 batch as the first route sync after sign-in or resume (so routes never exist without a lease that can expire), then at most once a day (from `cleanup()`, which runs only while polling runs). A lease write is one D1 row a day per active user. The global daily cron removes stale routes in one D1 batch whose conditions it evaluates at run time: `DELETE FROM webhook_routes WHERE user_id IN (SELECT user_id FROM webhook_route_owners WHERE refreshed_at < ?)`, then the same condition on `webhook_route_owners`, with `?` = now − 3 days. A lease renewed during the cron is not deleted. This removes stale rows of paused or stopped accounts even when their own delete failed, with no DO request.
7. On resume (`touch()` from paused, `start()`), `webhook_routes_sent` is empty, so the next complete build writes the full set and refreshes the lease.
8. Daily, in `cleanup()`: read the user's D1 rows and repair drift both ways (`SELECT target FROM webhook_routes WHERE user_id = ?` is cheap with the index).

### In the Poller DO

`webhookHints(hints)`:

Definition: **runnable** = `userId` set, not `stopped`, not `paused`, `retryAt <= now`, and the generation is the one that the work started with. `stop()` and every stop or pause path increment the generation.

1. If not runnable: return. Webhooks never resume a paused account, and polling covers a rate limit.
2. Tracked hints: map each `routeKey` to a local key (case-insensitive). Add them to an in-memory pending set (max 200; on overflow, drop the oldest). If no webhook read runs, start one: `exclusive(() => readBatch())`, where `readBatch` takes up to `CHUNK` keys (40, the existing GraphQL batch size in `worker/github.ts`), `fetchSubjects` → `record(who, subjects)` (not quiet). While keys remain, start the next `exclusive()` call. Each batch is a separate `exclusive()` call, so polls and UI work can run between batches. This RPC is not inside `cycle()`, so nothing holds the lock already.
3. Inside every batch and discovery callback: check runnable **before** the network request (a poll that ran first can pause the account or set `retryAt`) and again **before** `record()`. If not runnable, discard the batch.
4. Completion: every RPC awaits the read that **started after** its keys arrived. A key that arrives while a read of the same key runs waits for the next read, because the running read can be older than the change. A burst (a review with ten comments) shares one or two reads, with no timer. When keys are discarded (overflow, not runnable, a failed read), the RPCs that wait for them resolve at once; they never hang.
5. Discovery hints: keep one only if its reason applies to this user (their id in `userIds`, one of their team ids in `teamIds`, or `opened` in one of their `repo:` targets). If any is left, run the existing `rebuildFor`-style path in `exclusive()`, which honours `TRACKED_REBUILD_GAP` (5 minutes).
6. A failed read is not retried. Log it; polling and searches recover.
7. Store `lastWebhookReadAt` (for the status line) at most once a minute.

Cancellation: the Worker's `waitUntil` lasts at most 30 seconds after the response. A batch is one GraphQL request (normally under 2 s), but an RPC can also wait in the `exclusive()` queue behind a poll, and `record()` can read project statuses and run decisions. A discovery rebuild can take longer. If the caller is cancelled before the DO finishes, the work is lost; polling and the 15-minute search recover. To verify in PR 2: does a cancelled caller cancel an in-progress DO RPC? If yes, the Worker starts discovery with a separate fire-and-forget RPC that only sets a flag, and the next alarm cycle runs the rebuild.

### Cost (Workers Free plan)

These are estimates. PR 2 checks them against D1 `rows_written` and DO metrics with the real schema.

Per delivery:

- 1 Worker request, 1 D1 query (rows read ≈ matched targets), always.
- Per routed user: 1 DO request, 0 DO writes unless facts change (`record()` writes only changed subjects; it can also read project statuses and run decisions) or `lastWebhookReadAt` is due, and 1 GraphQL read shared by the burst.

Route sync. PR 2 measures each part on its own: `webhook_routes` rows, its user index, the lease row, and the local `webhook_routes_sent` rows in the DO.

- First sync after sign-in or resume: one route per tracked item, `repo:` target, and team (hundreds for a heavy user), plus the lease.
- Normal day: only items that join or leave the tracked set (tens a day), plus one lease row.
- Pause/resume: delete all, then write all again.

The D1 free plan has 100,000 rows written a day, and 5 million read. The DO request budget (100,000 a day) is the one to watch; the log line per delivery shows the routed-user count.

### Installation registry (D1)

```sql
CREATE TABLE github_installations (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,          -- lower-case
  account_type TEXT NOT NULL,           -- 'Organization' | 'User'
  repository_selection TEXT NOT NULL,   -- 'all' | 'selected'
  suspended_by TEXT,                    -- null | 'hush' | 'owner'
  reconciled_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE github_installation_repos (
  installation_id INTEGER NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,              -- lower-case, updated on rename/transfer
  PRIMARY KEY (installation_id, repo_id)
);
```

- Webhooks keep it current: `installation` (created, deleted, suspend, unsuspend, new_permissions_accepted), `installation_repositories` (added, removed), `repository` (renamed, transferred, deleted).
- `github_installation_repos` has rows only for `selected` installations.
- Daily reconcile (Cron Trigger): `GET /app/installations` (app JWT) for the list and the suspension state, then for each `selected` installation that is **not suspended** a short-lived installation token for `GET /installation/repositories`. A suspended installation keeps its last known repositories; they are read again after `unsuspend`. Each installation is reconciled on its own: one failure does not stop the cron. Installation tokens are used **only** here and are never stored.
- The same cron deletes stale routes (see "Route sync", step 6).
- A delivery from an installation that the registry does not know: process it, and reconcile that installation in the same `waitUntil`.

### Idle installations

Every delivery costs one Worker request, even when nobody tracks the item. GitHub delivers by app, not by repository, so the only way to stop deliveries for one org is to suspend the installation.

- The app can suspend its own installation (`PUT /app/installations/{id}/suspended`) and remove that suspension (`DELETE`). A suspended installation gets no webhooks.
- **An org owner cannot remove a suspension that the app made.** Only the app can. A Hush bug could leave an org stuck.
- No route rows does not mean "unused": a user with only `involves:@me` searches and no tracked item there still depends on direct-user and team discovery.

**v1: no automatic suspension.**

1. **Cheap drops.** A delivery that routes to nobody costs one Worker request and one D1 query, and no DO request. Item-level routing makes this the common case.
2. **Measure.** Log one line per delivery: event, action, installation id, routed-user count. Workers Observability gives the daily volume per installation. This is operations data, not product analytics: no user data, no third party.
3. **Show it.** Settings shows, per installation in the user's orgs: "No tracked items or repository targets match this installation now", when that is true. The docs say how to uninstall.

**Phase 2** (separate PR, only if the logs show a real cost), behind `WEBHOOK_AUTO_SUSPEND=on`. Requirements before it can ship:

- An explicit use lease: a D1 row `(installation_id, user_id, last_active_at)` that the user's DO refreshes at most once a day while it is active, for each installation whose account is the user's own account or one of the user's orgs (from `/user/orgs`). Route rows alone are not proof of use.
- Unknown = do not suspend: missing lease data, or `reconciled_at` older than 2 days.
- Suspend after 14 days with no active lease (the same as the poller's pause).
- Resume requests are rows (`resume_requested_at`), independent of route changes, so the cron retries failures. Triggers: a lease refresh, a sign-in, and a **Resume** button in Settings. The server checks org membership with the user's token before it accepts the button. Resume clears the idle timer.
- Never touch an owner-made suspension.

## What webhooks do not cover

These stay with polling. The docs and the UI must not promise more.

- New items that a view's search finds, except: a review request to you or your team, an assignment to you, and a new item in a repository that a view names with `repo:`. Each of those runs one view search, at most once in 5 minutes.
- An item that enters or leaves a view by a GitHub search qualifier (a label, a milestone, `involves:`). `patchDashCaches` keeps an item's sections; the next view search (15 minutes) changes them. Hush-local filters update at once, as today.
- CI on fork PRs, legacy commit statuses, and the start of a re-run.
- Items in a renamed or transferred repository, until the next view search.
- Repositories in orgs without the app, and any delivery that GitHub or Hush drops or limits. Those keep today's limits: a notification, a view search, or the one-hour details refresh.

## Surfacing it in Hush

### Settings → General → GitHub access → Webhook updates

Below "Orgs your GitHub sign-in can see":

- One line: "Orgs that install the Hush app send Hush changes to the pull requests and issues you track as they happen. Everything else updates with polling."
- One row per account that the user's sign-in can see, plus the user's own account:
  - **Installed** (all repositories, or "N repositories").
  - **Suspended by an owner**.
  - **Not installed** → **Install…** (`https://github.com/apps/<slug>/installations/new/permissions?target_id=<account id>`). GitHub shows **Request** to members who are not owners.
  - The muted "No tracked items or repository targets match this installation now" note, when true.
- Coverage: "Webhook updates on for 41 of 57 tracked items." From the user's routes joined with the registry. No GitHub call.
- Generic guidance, not per org: "An org can install the app and still hide its items from your sign-in. If an installed org's items are missing, see When an org is missing." (Hush cannot tell which orgs hide themselves.)

`/api/account/orgs` also returns each org's `id` (GitHub's `/user/orgs` has it), for `target_id`. New route `GET /api/account/webhooks` reads D1 only.

The app's Setup URL is `/settings/general?installed=1#github-access`: it scrolls to the block and shows a toast.

### Sync status

The status popover (where the app shows "Synced 2m ago") gets a second line: "Last webhook update 1m ago", from `lastWebhookReadAt` (a successful read, not a delivery). No line when the user has no covered items. No banner, no nag.

### Docs and site

- `github-access.md`: section **Webhook updates**: the app's read-only permissions, how to install, what it covers and what still polls (the list above), how to uninstall.
- `troubleshooting.md`: "An installed org gets no webhook updates" (OAuth approval, selected repositories, fork PRs, renamed repositories).
- Privacy and security pages: the app receives event payloads for installed orgs; Hush reads the repository, number, and user and team ids from them and stores no payload. D1 stores which tracked items, `repo:` repositories, and team ids route to which user, and the installations with their selected repositories.
- README: diagram line, env vars, the dev app, the budget lines above.

## Development and testing

- A dev app, **Hush (dev)**, with a tunnel webhook URL (`cloudflared tunnel --url http://localhost:8787`). `.dev.vars`: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (PKCS#8), `GITHUB_WEBHOOK_SECRET`. Without `GITHUB_APP_ID` the feature is off: the route answers 404, no cron work, no UI.
- `pnpm webhook:replay <fixture>` signs a fixture with the local secret and posts it to `:8787`.
- Unit tests:
  - signature (good, bad, missing, body over 1 MB); `webhookHintsOf` per fixture;
  - routing: per-user grouping, direct-user only for its reasons, `MAX_ROUTED_USERS`, rate limit;
  - route sync: diff, failed batch leaves `webhook_routes_sent` unchanged, delete on pause / fail-stop / stop, a D1 error in `stop()` still reaches `deleteAll()`, an older sync after a stop writes nothing, route sync during a poll, pause inside `schedule()`, and stop after a rejected token (no deadlock), lease written at most daily, cron delete skips a lease renewed during the run, rebuild after resume, lease refresh, cron deletes stale routes, daily drift repair;
  - `webhookHints`: stopped, paused, `retryAt`, `stop()` during a read (generation); a poll that runs first in the queue pauses the account or sets `retryAt`, and the queued batch makes no request; case-insensitive key mapping; burst sharing; the same key during a running read waits for the next read; waiting RPCs resolve on overflow, failure, and stop; batch size `CHUNK`; `exclusive()` released between batches; a slow `record()` path (projects, decisions) for the cancellation check;
  - discovery rules per reason; registry events including rename and transfer; reconcile (suspended installations skipped, one failure isolated); `fetchTeams` ids.
- Sandbox, on a private sandbox org: install; open a PR; request a review by user and by team; comment; finish CI; re-run CI; rename the repository. Check one push per fact, within seconds.

## Delivery: PRs

1. **Receiver and registry.** Route, signature, D1 migration (registry, routes, route owners), `webhookHintsOf`, installation and repository events, JWT, daily reconcile, replay script, dev docs. Feature off without env. No routing.
2. **Routing and the DO path.** Team ids, route sync (schema 20) with the stop paths, routing with limits, `webhookHints`, batched reads, discovery. Verify DO RPC cancellation.
3. **UI and docs.** Settings block, `/api/account/webhooks`, org ids, Setup URL, status line, docs, privacy, README. Screenshots: narrow and wide, light and dark.
4. **(Only if the logs show cost.)** Auto-suspend behind `WEBHOOK_AUTO_SUSPEND`, with leases and resume rows.

## Later

- Slower notification polling when all of a user's tracked items are covered.
- `status` events, with a SHA → PR map from stored facts.
- Route by repository id to remove the rename gap (needs `repository.databaseId` in subject facts).
- Shared installation-token reads, with their own authorization design.
