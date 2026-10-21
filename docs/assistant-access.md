# Passive assistant access to saved views

This is an internal foundation, not a live MCP server. No route, remote transport,
credential, grant, session, deployment, or poll schedule is added.

## Usable now

- `worker/assistant/snapshot.ts` reads existing Durable Object KV caches and SQLite
  records through a storage capability with only `get` and SQL `exec`. Every SQL
  statement is a fixed `SELECT` with bound item keys. It does not instantiate a
  Poller, migrate a schema, decrypt a token, fetch GitHub data, or start work.
- The caller supplies the trusted principal and the corresponding user's storage.
  The reader checks the stored user ID and exact current schema before SQL reads.
  A mismatch fails closed. Tool arguments cannot select a user or storage object.
- `worker/assistant/tools.ts` provides typed `list_views` and `get_view` functions.
  `worker/assistant/adapter.ts` supplies MCP-shaped tool definitions, read-only
  annotations, argument validation, and text/structured results without an MCP SDK
  or network server. An in-process caller can compose these three modules now.
- The UI and tools share membership/population, category filters, sorting, grouping,
  closed-item handling, snooze/mute evaluation, unread state, and changes-since-seen
  helpers. The existing dashboard API also uses the shared presentation function.
  This refactor has no intended visual or interaction change.

The snapshot uses the already-materialized `dash:pr` and `dash:issue` caches. Source
search membership, Hush search filters, category rules/manual pins, turn, reason,
priority, waiting time, stale-item flags, and project statuses come from those
caches. The reader does not rerun searches or decisions. It checks the same cache
signature as the dashboard, including date-expanded searches and dashboard filters.
An incompatible cache yields no items for that kind. Snooze expiry, closed-item
expiry, unread state, and changes since seen are evaluated from local records.

## Tool contract

`list_views({ limit?, cursor? })` lists view definitions in saved tab order. It
includes the effective default sort and closed-item preference. It does not return
account details, credentials, notification settings, or other settings.

`get_view({ view_id, kind?: 'both' | 'pr' | 'issue', limit?, cursor? })` defaults to
all kinds supported by the view's searches. It returns category display metadata
and grouped items with their Hush facts, including category/pin IDs, turn/reason,
priority, waiting/stale state, unread/seen state, and changes. It hides snoozed and
muted items. No option exposes dismissed items or requests a refresh.

The result represents the saved view's underlying item list. Browser-local kind
selection, category chips, collapsed groups, transient held rows, and stack-card
rotation are not saved view configuration. The tools do not reproduce those states
or fetch outside stack members. Shared projection tests compare the prior UI
pipeline for all grouping and sorting combinations.

Each requested kind reports its cache state and `fetchedAt`:

| State              | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `fresh`            | Compatible cache younger than the existing dashboard TTL (15 minutes). |
| `stale`            | Compatible cache at least 15 minutes old; returned without a refresh.  |
| `missing`          | No saved cache.                                                        |
| `settings_changed` | Cache signature differs, or the required source index is absent.       |

Cached errors and skipped-source reasons accompany each kind. `complete` describes
source coverage: every requested kind has a compatible cache, with no cached errors
or skipped sources for this view. It does not mean fresh or exhaustive GitHub data.
Hush's normal search result limits still apply. Partial results are explicit; a
missing cache is different from a complete empty view. Cache time is the last
dashboard build, not a guarantee that every item's facts were read at that time.
Later notification updates can patch cached items without changing that time.

Pages default to 50, with an integer range of 1–100. For `get_view`, pagination runs
after grouping and sorting, over grouped rows. A group can span pages; each page
includes only represented groups and their full group counts. `totalItems` counts
the population; `totalRows` counts group occurrences. `nextCursor: null` ends the
list. A complete empty view has zero totals and no groups or next cursor.

Cursors carry an offset and a SHA-256 content revision, bound to the principal and
projection. They are not credentials. Changes to visible facts, marks, seen state,
view settings, relevant categories, or freshness invalidate a view cursor. The
client must restart on `snapshot_changed`; no pages or sessions are persisted.
The cursor does not pin historical data or provide a transaction across calls.
Invalid arguments/cursors and missing views return bounded typed errors. Storage,
schema, and scope failures return `snapshot_unavailable` without internal details.

## Required next PR: authentication and remote transport

1. Add explicit user consent for a narrow saved-view read scope. Bind each request
   to a verified principal and that principal's storage. Do not accept a user ID,
   cookie, generic route, or arbitrary SQL from tool arguments. If consent limits
   access to selected views, filter both definitions and item metadata accordingly.
2. Add machine authentication, token audience/resource checks, expiration,
   revocation, and account-deletion behavior. Resolve the current account identity
   through a read-only lookup. This reader trusts its caller's principal; it is
   not an authentication mechanism and does not implement grant enforcement.
3. Add a passive Durable Object integration before a remote endpoint. The current
   `PollerBase` constructor calls `migrate()`, which can write or reset storage for
   a schema mismatch. Do not wrap this reader in the existing Poller lifecycle and
   claim the entire request is passive. A passive entry point must refuse an
   unavailable schema without running migrations, scheduling alarms, or touching
   activity. Preserve the existing schema check in the reader.
4. Wire only the two allowlisted tools to an authenticated MCP transport. Add
   transport-level tests for cross-account denial, consent scope, expired/revoked
   credentials, malformed requests, and cold-start schema mismatch. Check the
   complete request for no writes, alerts, polling, seen marks, or GitHub calls.

The current browser APIs are unsuitable shortcuts: `/api/me` records visits and
can resume polling, dashboard reads can refresh and emit alerts, and peek reads
can persist facts. Neither those APIs nor browser cookies are used here.

## Verification

Tests use isolated in-memory SQLite databases with the real schema. The passive
read test enables SQLite `query_only`, checks `total_changes()`, compares all KV
values, installs write/alarm traps, and rejects network calls. Other tests cover
scope/schema denial, cache states/errors, empty and partial results, cursor
invalidation, and adapter argument allowlisting. No live account or credentials
are needed.
