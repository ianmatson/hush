# Board and subject data update audit

Date: 2026-10-14

## Scope and cause

The audit covers PR and issue transformations: GitHub reads and writes, notifications, stored subject facts, dashboard rebuilds and patches, projects, decisions, categories, view filters, user marks, and browser invalidation. Account, authentication, and unrelated transport transformations are outside this scope.

Approval does not remove GitHub project membership. The approval route calls `recheck`, which reconstructs cached rows through `dashFactsOf` and `finishItem`. Those projections do not own `projectStatus`. The old patch replaced the row without restoring that field. Project grouping then showed “Not in project.” A regression test reproduced that result against the original implementation.

## Confirmed defects and corrections

| Transformation                | Correction and evidence                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject cache reconstruction  | Full builds and patches share `withProjectStatuses`. Approvals, issues, peek reads, notifications, and manual rechecks preserve independent project data. Successful reads refresh membership even when subject facts are unchanged.                                                                                                                                                                  |
| Failed project reads          | Retain the last known membership. With no earlier result, show “Project data unavailable.” A successful empty visible membership removes old membership. Hidden project entries do not restore removed visible projects or make every grouping unknown.                                                                                                                                               |
| Membership pagination         | Read all pages. A failed later page invalidates the whole accumulated result for that item. Complete sibling items remain usable. Full builds prune unused project definitions.                                                                                                                                                                                                                       |
| Partial GraphQL subjects      | Skip storage for affected subject nodes. Keep complete siblings. A partial peek still opens, but its partial facts cannot overwrite stored facts. Pathless errors are retryable, not evidence that every item is permanently unavailable.                                                                                                                                                             |
| Notification acknowledgement  | Store a small pending reference before processing. Remember successful versions after recording; retry missing reads on ordinary polls, including 304 responses. Stop after three attempts. Definitive deletion/access errors stop earlier. Rebuilds and cleanup continue during read failures. Preserve the initial quiet flag.                                                                      |
| Diff mutations                | Resolve the parent before a successful submit, reply, resolve, edit, delete, thread creation, or discard; refresh afterward. A failed parent lookup skips only the refresh, so it cannot block a write. Single-comment REST writes already have the parent reference.                                                                                                                                 |
| Decision and category changes | Reconstruct from stored facts and current decisions without GitHub reads. Recalculate urgency, comments needing a reply, turn, ordering, categories, and pins. Preserve project and external source metadata. User seen, mute, and snooze state remains a separate overlay.                                                                                                                           |
| Local view filters            | Cache matched local filters and canonical source memberships. Patches remove only views that no longer match and restore them after later changes. Recalculate turn using passing view names, as full builds do. Apply the same board bot/draft exception in both paths. Retain recently closed rows only in their previously visible views.                                                          |
| Failed source searches        | Carry prior hits only for failed query identities, for at most one hour. Missing/deleted/inaccessible boards do not carry prior hits after definitive results. Successful-query absence remains authoritative, including when another query in the same view fails. Prefer the newest update time when fresh and carried hits overlap. Failed builds remain incomplete for tracking cleanup.          |
| Concurrent cache patches      | Make project/team network requests first, then read the current cache and write without another network wait. A delayed patch test preserves another item's update and a changed signature.                                                                                                                                                                                                           |
| Browser and server payloads   | Keep only IDs, source memberships, matched queries/filters, closure metadata, and project fields in server source metadata. Reconstruct rows from the subject store rather than cache duplicate full rows. Exclude source metadata and project-error bookkeeping from public responses and browser persistence. Refresh legacy caches that lack source metadata and change the browser cache version. |

## Data ownership and update coverage

- GitHub subject facts belong to `subjects`. Successful reads pass through `record`; incomplete reads cannot erase them.
- Project membership and definitions belong to project reads. A subject update does not imply project removal.
- External source membership belongs to dashboard searches. Stored local filters allow immediate local reevaluation.
- Decisions and categories derive from stored subjects. Category pins have their own table. Pin/category changes recompute rows and apply the same visibility rules as full builds.
- Seen/unseen, mute, and snooze belong to user tables. `dashboardView` applies them to public rows.
- Item actions use `recheck`. Diff actions use the post-write refresh. Project actions schedule board rebuilds.
- Dashboard live messages invalidate browser queries. Optimistic client changes spread the old row and preserve independent fields.

## Limits and follow-up work

- External GitHub search qualifiers and board source eligibility refresh on dashboard builds, normally within 15 minutes. Local filters update immediately. A previous cache without query identity uses conservative per-view carry-forward until its next successful build, bounded to one hour.
- Unknown notification items can trigger a tracked-view rebuild at most once per five minutes. Pending references retry three times. An item discovered during that period can receive one delayed mention alert; baseline retries remain quiet. An outage across all three attempts can drop the mention alert. The previous code dropped it immediately.
- Subject collections remain bounded: ten labels, ten assignees, twenty requests, ten verdicts, fifty review threads, and three request events. Counts and rules beyond those bounds need pagination or completeness metadata.
- Network-first patch ordering addresses overlapping patches. A full rebuild still has no revision guard against a newer patch completing during its reads. This is a source-backed risk, not the observed approval cause. A separate concurrency design should cover all writers.
- A source-only row hidden by local filters can lose its stored subject after 30 days. A full rebuild reads it again, normally within 15 minutes.
- Post-write refresh failures are logged. They do not reverse a successful GitHub write; polling must reconcile them later.

## Validation and cost

Tests exercise actual cache-patch, ingestion, dashboard-build, grouping, and diff-route methods with mocked storage and GitHub responses. They cover project removal, failed and partial reads, query-specific retention, decision/local-filter changes, cache ordering, bounded retries, quiet flags, and write-lookup failures. The full suite, type/Svelte checks, formatting, and whitespace checks are required before the PR.

Browser captures use the actual interface with sandbox responses at narrow/wide widths in light/dark mode. Before/after GIFs show a simulated approval update. No review was submitted to GitHub. Production database state, real approval latency, and live GitHub rate-limit impact were not tested.

Approval and merge reconciliation add a batched project query, with more calls for pagination. Diff GraphQL writes also add a parent lookup. Slim metadata and projected retry references avoid duplicate full dashboard rows and raw repository payloads. The SQLite-backed Durable Object has a 2 MB combined key/value limit, so very large dashboard capacity remains bounded; this audit does not establish a production maximum. See [Cloudflare storage limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
