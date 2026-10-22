# Webhook updates from a GitHub App

Status: draft, 2026-10-22. Step 6 of plans/core-model.md, on top of the Workspace model (PR #92).

## Goal

Org owners can install a **Hush GitHub App** on an org or a personal account. Hush then learns in seconds that a tracked pull request or issue in that org changed. Polling stays as it is: views that search outside installed orgs keep working, and polling stays the safety net for everything that webhooks miss.

Webhooks fix two weak points of polling:

1. Latency. A notification arrives at the next notifications poll, 5 or 15 minutes later.
2. Facts with no notification. CI that finished, a review on someone else's PR, or a merge by someone else wait for the next search (15 minutes) or the safety read (one hour).

## Non-goals

- Sign-in does not change. The Notifications API does not accept GitHub App tokens, so the OAuth app stays the sign-in and each user's reader.
- Hush stores no webhook payloads and builds no facts from payloads.
- Installing the app does not give a user's OAuth token access to an org. That is still the OAuth app approval.
- Webhooks do not decide view membership. Searches keep discovery (plans/core-model.md §12).
- No installation tokens, no shared reads, no owner-wide routing, and no automatic suspension.

## Core decision: a webhook is an invalidation

A webhook says "item `<repository id>#<number>` changed". Every user whose Workspace is interested in that item gets an invalidation. The Workspace requests a read of the item with the user's own token, through the read work that notifications and searches already use (plans/core-model.md §10). The commit, alerts, live messages, feeds, and MCP need nothing new.

- Permissions stay correct: each read uses a token that the user owns. A user who lost access gets `inaccessible`, as today.
- Bursts share reads: a review with ten comments gives ten invalidations, but the versioned read request (`requestReads`) keeps one pending read per item. An invalidation that arrives after a read started requests one more read, because that read can be older than the change.
- The Workspace bounds each run: at most `MAX_PENDING_READS` pending reads, `READ_BATCH` per run, and the run's call budget. These do not bound the number of runs or deliveries in a day; see "Admission and budget".

## Architecture

```
GitHub ──POST /api/github/webhook──▶ Worker
  1. verify X-Hub-Signature-256 on the raw body (HMAC-SHA256, constant time), else 401
  2. routeKeysOf(event, payload): pure, fixture-tested → ['<repoId>#<number>', …] (at most 50)
  3. one D1 query: SELECT user_id, route FROM webhook_routes
                   WHERE route IN (SELECT value FROM json_each(?))
  4. group by user; drop users over WEBHOOK_LIMIT
  5. await all Workspace RPCs at once (Promise.allSettled): invalidate(routes)
  6. answer 202
Workspace.invalidate(routes)
  open() only (never create or activate) → active? → interested item ids
  → requestReads(ids, 'webhook', now) → lastWebhookAt = now → alarm at the earliest due work
```

The RPC only records work and sets the alarm. It does no GitHub read, so the Worker awaits it before it answers, and nothing depends on `waitUntil`. A D1 or RPC failure makes the delivery fail. GitHub does not send a failed delivery again, so polling covers it. PR 1 measures the delivery latency, which must stay well under GitHub's 10-second limit.

### Events and permissions

App permissions, all **read**: Metadata, Pull requests, Issues, Checks. No installation events are needed.

| Event                         | Actions                      | Route                                          |
| ----------------------------- | ---------------------------- | ---------------------------------------------- |
| `pull_request`                | all                          | `repository.id`, `pull_request.number`         |
| `pull_request_review`         | submitted, edited, dismissed | `repository.id`, `pull_request.number`         |
| `pull_request_review_comment` | created, edited, deleted     | `repository.id`, `pull_request.number`         |
| `pull_request_review_thread`  | resolved, unresolved         | `repository.id`, `pull_request.number`         |
| `issues`                      | all                          | `repository.id`, `issue.number`                |
| `issue_comment`               | created, edited, deleted     | `repository.id`, `issue.number`                |
| `check_suite`                 | completed                    | `repository.id`, each `pull_requests[].number` |

Not in v1, on purpose:

- `check_run`: one event per job. A "CI failed" alert comes when the suite completes, and the start of a re-run is not seen at once.
- `status`: only a SHA.
- Fork PRs: `check_suite.pull_requests` is empty, so their CI stays with polling.
- Item transfers to another repository change the route. The next search finds the item again.

Sandbox check before the CI part ships: an app with Checks read gets `check_suite.completed` for suites that GitHub Actions and other apps create.

### Route identity

- Route = `<repository database id>#<number>`. A repository rename does not change it.
- Subject facts get `repoId` (GraphQL `repository { databaseId }` in the item read). Items without it get it at their next read; until then they have no route. No migration.

### Routing table (D1)

```sql
CREATE TABLE webhook_routes (
  route TEXT NOT NULL,      -- '<repoId>#<number>'
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (route, user_id)
);
CREATE INDEX webhook_routes_user ON webhook_routes(user_id);
CREATE TABLE webhook_route_leases (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  renewed_at INTEGER NOT NULL
);
```

D1 proves neither permission nor view membership. The Workspace checks interest again for every invalidation.

`MAX_ROUTED_USERS = 50` per delivery. Over that, the Worker routes the first 50 by `user_id` and logs it. With two users this never happens.

### Admission and budget

GitHub sends every event of an installed org, so the delivery volume, not Hush, sets the cost of the Worker requests. The Workers Free plan has 100,000 requests a day, which is about 1.2 a second, shared with normal app traffic.

- `WEBHOOK_LIMIT`, a rate-limit binding: 60 invalidations a minute for each user. Over that, the Worker drops the invalidation before the DO request, and polling covers the item. The binding is approximate and local to each Cloudflare location, so it limits storms, not the daily total.
- `invalidate()` writes only when it adds or renews a read. An item with a pending read that no run has claimed needs nothing, so a burst between two runs writes once.
- Before installing on a busy org, measure its delivery volume (the app's delivery log, or one day on the dev app). If it is more than 30,000 deliveries a day, install the app on selected repositories only, or uninstall it.

### Route sync (Workspace → D1)

The Workspace owns its rows. Its wanted set is the route of every interested item (members, retained items, and candidates; `CommitResult.interest`) that has `repoId`.

1. `commit()` already returns the interest set. The engine marks routes dirty when the wanted set differs from `routesSent`, a state value of the Workspace (`state` key `webhookRoutes`, written only when it changes).
2. A `routes` phase, the last phase of `run()`, diffs wanted against sent and applies the difference as one D1 batch of three statements, whatever the number of routes. D1 on the Free plan allows 50 queries for each invocation, so the statements take the routes as one bound JSON array:
   ```sql
   INSERT OR IGNORE INTO webhook_routes (route, user_id) SELECT value, ?1 FROM json_each(?2);
   DELETE FROM webhook_routes WHERE user_id = ?1 AND route IN (SELECT value FROM json_each(?3));
   INSERT INTO webhook_route_leases (user_id, renewed_at) VALUES (?1, ?4)
     ON CONFLICT (user_id) DO UPDATE SET renewed_at = excluded.renewed_at;
   ```
   Only after the batch succeeds does it save the new `routesSent`.
3. A failed batch changes nothing. The phase catches the error and tries again after `ROUTES_RETRY_MS`. Route sync has its own retry deadline and never sets `retryAt.github`, and GitHub's rate limit does not stop it. Because it is the last phase, a slow D1 call does not delay GitHub work in the same run. A slow GitHub phase can delay route sync; that is acceptable.
4. Pause, stop, and a rejected token: the Workspace first clears `routesSent` and bumps the generation (local, cannot fail), then deletes its D1 rows best effort. `stop()` always reaches `deleteAll()`.
5. Resume and restart start from an empty `routesSent`, so the next run writes the full set.
6. Lease: the Workspace renews `webhook_route_leases.renewed_at` in its daily cleanup and in every route batch. A daily cron deletes the routes and leases of users whose lease is older than three days. This removes the rows of a Workspace whose own delete failed.
7. Drift repair: the daily cleanup reads the user's D1 rows (`SELECT route … WHERE user_id = ?`, indexed) and repairs both ways.

Route sync checks the generation before its batch and before it saves `routesSent`. It cannot undo a D1 batch that commits after a stop deleted the rows: those late rows stay until the next drift repair or until the lease expires. They do no harm, because `invalidate()` uses `open()` only, and a stopped or deleted Workspace ignores them.

### In the Workspace

`invalidate(routes)`:

1. Use `open()`, never `active()`: an old route must not create or start a Workspace. If there is no engine, or the lifecycle is not `active`: return. A webhook never resumes a paused account.
2. Map each route to an interested item id (a map from the interest items' `repoId#number`). Drop the others: D1 can be a little behind. If none remain: return, with no write.
3. `requestReads(ids, 'webhook', now)`, then set `lastWebhookAt = now`. Both go in `Sync`, so one write. Skip the write when every id already has a pending read that no run has claimed.
4. The alarm is the earliest due work, as always. Normally the read runs about one second later (the `settle()` clamp). There is no upper bound: a running run, a read backoff, a rate limit, or a used-up budget delays it.

`requestReads` gets one rule for the `webhook` priority: it bumps the version but keeps the `attempts` and `notBefore` of an existing request, so a stream of deliveries cannot skip a failed read's backoff. `readsFailed` applies the backoff to the current request also when a webhook renewed its version during the read. Interactive reads (the peek) keep today's rule. A webhook read has the same order as a background read.

### Cost (Workers Free plan)

Estimates. PR 2 checks them against D1 `rows_written` and the DO metrics.

- Every delivery: 1 Worker request and 1 D1 query.
- Each routed user, within `WEBHOOK_LIMIT`: 1 DO request and at most 1 DO write (the whole `Sync` value, which is several kilobytes). The read itself runs in the next alarm and is shared by the burst.
- Route sync: the first sync after sign-in or resume writes one row per interested item (hundreds), the same number of index rows, and the lease. A normal day writes tens of rows plus the lease.
- PR 1 measures D1 `rows_written` (with index writes), DO writes, and the size of `Sync`, with a fixture of 500 routes.

An unrouted delivery, for an item nobody tracks, costs 1 Worker request and 1 D1 read. That is the common case in a busy org, and it is why v1 needs no automatic suspension.

## Idle installations

GitHub sends every event of an installed org, also when nobody tracks the item. The only way to stop deliveries for one org is to suspend the installation, and an org owner cannot remove a suspension that the app made.

v1 does not suspend:

1. **Cheap drops.** An unrouted delivery costs no DO request.
2. **Measure.** One log line per delivery: event, action, installation id, routed users. This is operations data, not product analytics.
3. **Uninstall.** The docs say how an owner uninstalls the app.

Automatic suspension is a later, separate plan, only if the logs show a real cost.

## Surfacing it in Hush

### Settings → General → GitHub access → Webhook updates

Below "Orgs your GitHub sign-in can see":

- One line: "Orgs that install the Hush app send changes to the pull requests and issues you track as they happen. Everything else updates with polling."
- One row per org that the sign-in can see, plus the user's own account: **Installed**, **Suspended**, or **Not installed** with **Install…** (`https://github.com/apps/<slug>/installations/new/permissions?target_id=<account id>`). GitHub shows **Request** to members who are not owners.
- The install state comes from `GET /app/installations` with the app JWT, read when the block opens and cached for five minutes. No installation registry.
- `/api/account/orgs` also returns each org's `id`, for `target_id`. A new route `GET /api/account/webhooks` returns the install states.
- The app's Setup URL is `/settings/general?installed=1#github-access`: it scrolls to the block and shows a toast.

### Sync status

The status popover gets a second line, "Last webhook received 1m ago", from `lastWebhookAt`. It changes only when a delivery matched an item that this Workspace tracks. No line when the user never got one. No banner.

### Docs

- `github-access.md`, section **Webhook updates**: the read-only permissions, how to install and uninstall, what webhooks cover and what still polls (the list below).
- `troubleshooting.md`: "An installed org sends no webhook updates" (OAuth approval, selected repositories, fork PRs).
- Privacy and security: the app receives event payloads for installed orgs. Hush reads the repository id, the item number, and the event name, and stores no payload. D1 stores which item routes go to which user.
- README: the diagram line, the env vars, the dev app, and the cost lines.

## What webhooks do not cover

These stay with polling. The docs and the UI must not promise more.

- New items. Searches find them, at most 15 minutes later, or a notification brings the search forward.
- An item that enters or leaves a view by a GitHub-only search qualifier (a label, a milestone, `involves:`): the next search changes membership. Hush-local filters update at once, after the read.
- CI on fork PRs, legacy commit statuses, and the start of a re-run.
- Items whose `repoId` Hush has not read yet.
- Orgs without the app, and any delivery that GitHub drops.

## Development and testing

- A dev app, **Hush (dev)**, with a tunnel webhook URL (`cloudflared tunnel --url http://localhost:8787`). `.dev.vars`: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (PKCS#8), `GITHUB_WEBHOOK_SECRET`. Without `GITHUB_APP_ID` the feature is off: the route answers 404, the cron does nothing, and the UI hides the block.
- `pnpm webhook:replay <fixture>` signs a fixture with the local secret and posts it to `:8787`.
- Unit tests:
  - signature: good, bad, missing, and a body over 1 MB;
  - `routeKeysOf` for each fixture;
  - routing: grouping by user, `MAX_ROUTED_USERS`, `WEBHOOK_LIMIT`, and a D1 or RPC failure;
  - `invalidate`: no engine (no creation), inactive lifecycles, routes that are not interested (no write), bursts that share one read and one write, an invalidation during a running read;
  - backoff: a webhook keeps a failed read's `attempts` and `notBefore`; a read that fails after a webhook renewed it still backs off;
  - route sync: an initial sync of 500 routes in three statements; diff; a failed batch leaves `routesSent` unchanged; a route failure while GitHub work is due; route sync while GitHub is rate-limited; delete on pause, stop, and a rejected token; the order "batch starts, stop deletes the rows, batch commits, the checkpoint is refused, the cron removes the rows"; the lease; drift repair;
  - `repoId` in the item reader.
- Sandbox, on a private sandbox org: install, open a PR, request a review, comment, finish CI, re-run CI, and rename the repository. Check one alert per fact, within seconds.

## Delivery: PRs

1. **Receiver and routes.** `repoId` in facts, the D1 migration, the webhook route with its signature check, `routeKeysOf`, routing, `Workspace.invalidate`, route sync with the lease and the cron, and the replay script. Off without env.
2. **UI and docs.** The settings block, `/api/account/webhooks`, org ids, the Setup URL, the status line, docs, privacy, and README. Screenshots: narrow and wide, light and dark.

## Changes from the parked plan

- Hints became invalidations through the existing versioned reads. `webhookHints`, the pending set, `exclusive()` batches, and the RPC completion rules are gone.
- Discovery hints are gone (`repo:` and `team:` routes, direct-user routing, team ids). Searches and notifications keep discovery.
- The installation registry, the reconcile cron, and installation tokens are gone. Settings reads the install state on demand.
- Routes use the repository id, so renames no longer leave a gap.
- The Worker awaits a fast RPC, so the open question about cancelled `waitUntil` work is gone.
- The rate-limit binding stays, but it limits invalidations for each user, not hints.

## Later

- Slower notification polling when all tracked items are covered.
- Direct-user discovery for review requests and assignments, if notifications prove too slow.
- `status` events, with a SHA → PR map from stored facts.
- Automatic suspension of idle installations, with its own plan.
