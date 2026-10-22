# Hush core model

Date: 2026-10-22. Status: agreed design; not built.
Supersedes the data model under plans/github-app-webhooks.md (PR #90); redesign webhooks after the core cutover.

## 1. Core decisions

- Keep one private `Workspace` Durable Object per user.
- Use one commit function and one pure evaluator for all consumers.
- Store remote evidence, user choices, transition state, and pending work. Never store rendered dashboards.
- Run network work through one bounded dispatcher, outside domain commits.
- Keep authorization per user. Do not introduce a shared private item store.
- Accept re-entry alerts, bounded search windows, and the end of background interest after departure.

## 2. Nouns

| Noun       | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| Item       | One GitHub PR or issue, identified by its node ID                               |
| Source     | One concrete remote query and its last successful bounded result                |
| Clause     | One saved search compiled into source bindings and a local predicate            |
| View       | A named union of clauses, with display and alert settings                       |
| View state | The previous ordinary membership, retained closures, and initial baseline state |
| Alert      | An accepted notification cause, its history, and its delivery state             |
| Work       | A bounded pending read, refresh, or delivery                                    |

Kind is an item field; a view can contain PRs, issues, or both.
Repository ID, name, number, and URL are locators. Resolve textual locators without case sensitivity.
Renames and transfers change locators, not item identity or user marks.

## 3. Storage: five tables

| Private SQLite table | Content                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `items`              | ID, locators, facts revision, GitHub/viewer facts, project facet, analysis answers, attention |
| `sources`            | Query identity and one bounded array of candidate references; write only on change            |
| `view_state`         | One row per view: `scope_hash`, `members[]`, `retained[]`, `seeded_bindings[]`, `baseline[]`  |
| `state`              | Typed key/value records: `config`, `sync`, and `channel:<id>`                                 |
| `alerts`             | Accepted causes, history text, pending state, and channel outcomes                            |

Keep item facets in typed columns. Each input changes only its own columns.
Attention holds the seen baseline, explicit unread choice, typed snooze, mute boolean, pins, and repeat state.
`config` holds settings, views, categories, teams, and project definitions. Channel records hold devices and channel references.
`sync` holds bounded schedules, freshness, source health, work, generations, rate limits, revision, and notification checkpoints.
Its notification checkpoint includes a bounded thread-ID/version map. Eviction can cause redundant work; alerts depend on item transitions, not map presence.
Freshness stays out of item rows. An unchanged read of 200 items must not write 200 item rows.
Do not put item bodies or source result arrays in `sync`. Bound all maps; partition only if measured size requires it.
D1 holds accounts, encrypted credentials, sessions, feed capabilities, Slack connections, and later webhook dispatch metadata.
Keep MCP grants separate. Webhook routes contain no item titles, bodies, or user marks.

## 4. Sources and clauses

Preserve each remote query's association with its own local predicate. A matching clause admits an item to its view.
The compiler owns kind constraints, `@me`, `@team`, relative dates, `archived:false`, and board versus search readers.
Compile applicable hide rules into the predicate. Derive the board bot/draft exception from the adapter; no visibility-policy object is needed.
One board clause cannot exempt another clause's results. Keep existing language limits, including `about:` in category rules only.
Compute categories before local category filters. Required unknown inputs cannot pass, including through negation.

Deduplicate sources by concrete query, adapter, kind, and credential generation within one user.
Keep stable logical bindings for clause expansions. `@today` rollover changes execution, not view scope or initial-baseline state.
Remote results decide GitHub-only membership. Do not reconstruct arbitrary GitHub queries from item summaries.
Known exact constraints, such as open-only clauses, can reject contradictory facts immediately.

A successful result replaces its source window, including an exactly-100-item result. Show truncation when known.
An absent item can have fallen below the limit. Never accumulate old windows to simulate complete search results.
An actual partial or failed result preserves only its own earlier window, marked stale, for at most one hour.
Definitive access loss invalidates affected evidence immediately. Complete siblings in partial batches remain usable.
Hydrate new candidates and request reads when timestamps differ, CI runs, or safety freshness expires.

## 5. View state and new-in-view

`members[]` contains ordinary logical members before snooze/mute and before retention. It is a transition checkpoint, not a render cache.
`retained[]` contains IDs retained after an observed closure. Expiry derives from the item's `closedAt + 24h`; do not store it twice.
These sets can overlap. Ordinary membership and retention have different removal rules; do not merge them into an untagged set.
`seeded_bindings[]` records logical bindings whose initial successful result was seeded for this view scope.
`baseline[]` records quietly seeded candidates awaiting their first settled eligibility evaluation.

Scope covers membership definitions and relevant eligibility versions. Rename, sorting, grouping, and `pushNew` do not change it.
A changed scope starts quiet and discards old retention. A new view can seed from an already successful shared source.
At each binding's first successful result, capture its candidates in `baseline` and mark the binding seeded.
Remove a baseline ID when eligibility first settles or it leaves all valid evidence. Stale required analysis does not settle an initial baseline.
Short-circuit facts or rules can settle eligibility without unrelated AI. Prune bindings no longer used by the view.
When failed evidence expires, reset the affected binding's seed; its first recovered result becomes a quiet repair baseline.
All arrays remain bounded by current bindings and candidates. No admission ledger, departure ledger, or watch tail exists.

New-in-view is `next ordinary members − previous ordinary members`, except initial-baseline and local-command transitions.
Genuine re-entry can alert again. Snooze expiry, grouping, pins, and configuration edits do not create new-item pushes.
Quiet belongs to view admission. Adding a view must not suppress valid fact alerts in another active view.
Combine fact and admission causes per item in the commit and with its pending alert. Do not promise reconstruction of every remote event.

## 6. Closure and interest

An observed open-to-closed transition retains the item in previous member views that enable `keepClosed`, until `closedAt + 24h`.
Reopening cancels retention. Snooze/mute still apply. Access loss removes the item regardless of retention.
Explicit closed-item searches supply ordinary membership independently of retention. `keepClosed:false` must not remove their results.
Never preserve false source hits to implement retention; shared sources can serve views with different retention settings.

Keep a bounded summary read of departed open members before committing the source replacement, where the work budget permits.
Use the ordinary item reader and commit its facts with the result. This is not a separate observation or recovery path.
Without this read, search can remove an item before closure is observed, ending all background interest in it.
Failed or omitted reads get no recovery record and no retention. The 24-hour hold remains best effort in those cases.

Interest is ordinary members, retained items, and all valid source candidates, including candidates hidden by local predicates.
An unrelated peek does not create background interest. Notifications outside interest can advance discovery.
Fact-alert eligibility requires membership before or after the transition; hidden candidates alone cannot authorize alerts.
Remove unreferenced facts after 30 days and alerts after their history window. Preserve live candidates and explicit live attention state.

## 7. Commit and evaluator

`commit(input)` accepts typed observations, local commands, and time transitions; it checks lifecycle, credential, and resource generations.
It loads affected state, applies complete accepted observations, and compares previous versus next evaluation.
Atomically store changed records, view transitions, alert causes, remaining work, revision, and the required alarm state.
The calculation is synchronous. Its storage wrapper can await local storage, never network work.
Broadcast revision and affected view IDs afterward. No nested asynchronous locks or rebuild calls are permitted.
Configuration and pin changes commit transition state even though rendered rows remain derived.

`evaluate(config, items, sources, viewState, now)` returns rows, ordinary membership, groups, counts, health, and the next time boundary.
Order: facts/analysis → turn/categories → clause eligibility → ordinary/retained membership → attention → presentation.
Turn never depends on view names; categories do not alter turn. Keep role, review, field, category, project, and custom grouping.
Do not store turn, category placement, unread, sorted rows, groups, counts, or action labels. Start without a projection cache.

## 8. Seen, snooze, and mute

Return the compact seen baseline and facts revision with browser item responses. The client echoes exactly what it displayed.
Validate shape, size, item identity, and account scope. Store that baseline with server `seen_at`; never replace it with newer facts.
Keep the acknowledged revision so delayed older acknowledgments cannot replace newer ones. No version archive or re-acknowledgment protocol exists.
The baseline can change attention only, never facts or authorization. Unread derives from explicit unread, absent baseline, or meaningful differences.
Labels alone do not cause unread. Use the same baseline for “since you looked” changes.

Mute is a boolean. Snooze is activity, time, or event, with the existing seven-day maximum for event snoozes.
Only relevant GitHub activity wakes activity snooze. AI, pins, and freshness timestamps do not.
The evaluator shows expiry immediately. A scheduled commit consumes the snooze once; its ID deduplicates the wake alert.
Keep bounded activity attribution. Add no pagination and make no exact-attribution promise for unseen activity.

## 9. Analysis and project facets

Cache analysis by item, question-set version, and relevant input hash, including viewer roles when used.
Version changes cover questions, prompt instructions, and model configuration. Reject obsolete completions.
For category eligibility, use the previous answer from the same version while its new input is analyzed; mark it stale.
Keep that answer on transient failure and retry through ordinary work. No provisional-membership rule is needed.
Without a usable answer, required eligibility is pending. A version change invalidates old answers and quietly resets affected view scopes.
Stale answers cannot establish facts about new activity: current reply classification and urgent delivery overrides require matching input.
Use the ordinary unknown fallback until those answers arrive. Analysis never delays GitHub fact publication or creates a GitHub fact event.
Category precedence remains pin → first matching rule → usable Jev choice → no category; pending prerequisites must remain distinct from false.

Projects have known, unknown, and unavailable states. Transient failure preserves the last complete value with stale status.
Empty membership differs from unknown membership; no status differs from no membership. Replace sets only after complete pagination.
Read project data for grouping, board features, or explicit requests. An unrelated item refresh cannot erase it.
Project edits invalidate the affected facet and board sources. Complete siblings from partial requests remain usable.

## 10. Inputs

| Input          | Work and commit                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| Notifications  | Read interested items; unknown references can advance discovery once per five minutes |
| Source         | Replace successful windows; hydrate candidates; include bounded departure reads       |
| Safety refresh | Read interested candidates even when GitHub timestamps stay unchanged                 |
| Webhook        | Invalidate known interested items; use the same read work                             |
| Peek/recheck   | Request a high-priority summary read through the dispatcher                           |
| GitHub action  | Execute with the user's credential; preserve success; request subsequent reads        |
| Local command  | Commit attention/configuration and necessary further work                             |
| AI answer      | Check input identity; commit analysis and dependent transitions                       |
| Time           | Commit due expiry, wake, or delivery transitions                                      |

Keep the OAuth/classic-token notification reader. App tokens do not replace it.
Persist work before advancing notification checkpoints; retry pending reads even after 304 responses. Use no notification-specific retry pipeline.
All authoritative summary reads run through Workspace. Transient conversation/file routes cannot call `recordFetched`.
A successful GitHub write stays successful if refresh fails. Do not blindly retry an ambiguous non-idempotent write as read work.

## 11. Dispatcher, alarm, and delivery

Use bounded batches; local commits remain possible during network waits. Prioritize interactive commands between batches.
Allow one summary read per item. Hints before its start share it; later hints request another read.
Check generations before I/O and commit. Pause, deletion, and credential replacement invalidate outstanding work.
Resume uses an explicit activation/baseline policy. `updatedAt` is a hint, not a revision; retain read ownership and command ordering.
Store due times for notifications, sources, item reads, analysis, delivery, and cleanup; the alarm is the earliest runnable deadline.
Start with notifications every five minutes active/with alerts, fifteen minutes idle; discovery every fifteen minutes; safety reads within one hour.
Budget faster CI/webhook work. Respect integration-specific retry deadlines; one failed integration must not pause everything.
Persist continuations and their wake together. Bound work; overflow requests bounded reconciliation. No debounce keepalive is needed.
Webhook acknowledgment must not depend on GitHub or AI reads completing in `waitUntil`.

Store alert causes in the commit; deliver afterward using deterministic cause IDs and current attention/access checks.
Keep at most one pending notification per item; preserve history when a later cause supersedes it.
One delivery module applies repeat, focus, digest, quiet hours, urgency, and channel policy. Derive digest counts from pending items.
Record outcomes per channel. Stable tags and bounded retries limit duplicates after a send succeeds but its receipt write fails.

## 12. Webhooks and consumers

Start with item-only routing. D1 maps interested item IDs to users; it proves neither permission nor query membership.
Verify deliveries and dispatch bounded invalidations. Workspace rechecks interest and reads with the user's credential.
Maintain route differences through idempotent work with generation/lease repair; route failure cannot block local commits or deletion.
Searches retain discovery; safety reads cover unmappable CI events. Add no owner-wide routing, shared item reads, or automatic suspension.

- Browser: server-computed views, explicit activation/Refresh, disposable account-scoped cache.
- WebSocket: revision and affected view IDs; reconnect reads a snapshot. No client replica or replay protocol.
- Feed: same membership/attention; open ordinary items, up to 50; category feeds filter the current-view union.
- MCP: same evaluator, approved views and field allowlist; passive access without activation, migration, remote reads, or history writes.
- Details: transient conversation/files stay separate from the durable summary.

Responses include revision, evaluation time, source health, and next time boundary. Time can change output without new GitHub data.
Construction does not activate Workspace. Passive readers return unavailable before storage is ready.
Stack grouping cannot admit neighboring PRs or expand an MCP grant. Apply existing scope-change grant checks.

## 13. Modules, limits, and deletion

Use a thin Workspace shell plus `store.ts`, `compile.ts`, `evaluate.ts`, `commit.ts`, `readers/`, `work.ts`, and `deliver.ts`.
Retain useful pure turn/rule/group/diff functions. Add no inheritance chain or generic event framework.
Measure the account budget with workload fixtures: database/index rows, requests, active duration, bytes, CPU, and subrequests.
Writes follow changed item/source/view records, bounded checkpoints, and alerts. Do not write unchanged items or claim capacity from table count.
Bound source expansion and accelerated work; show delayed work. Keep no product analytics and add no unmeasured cache.
Delete dashboard snapshots and patch/rebuild/re-place paths, hidden source metadata, tracking/admission tables, and alarm-minus-gap scheduling.
Delete watch tails, unresolved departures, sentinel mute, view-name turn fallback, and competing promise registries.
Replace held-message counters with alert state. Keep authentication, cryptography, and channel adapters.

## 14. Rewrite and acceptance

1. Specify compiler/evaluator/transition behavior with executable examples, including deliberate behavior changes.
2. Build storage, commit, work, and explicit schedules with an injected clock.
3. Port polling, sources, summaries, projects, and analysis into readers.
4. Switch browser/actions, feeds, MCP, WebSockets, and delivery to this model.
5. Make one schema/cache cutover for two users; stop old alarms and remove old code/migrations. Avoid lasting dual writes.
6. Redesign webhooks on the new model.

Required cases: delayed baseline details/AI; stale categories; obsolete AI versions; fresh-activity classification; reused sources; `@today` rollover;
independent source failure/recovery; 100-result replacement; departure-read failure; explicit closed searches; retained/ordinary overlap;
stale seen acknowledgments; equal timestamps with changed CI; pause/deletion during reads; project partial failure;
read-after-write failure; alarm replay; notification-map eviction; send success followed by receipt failure.
Compare browser, feed, and approved MCP results at the same revision and time, allowing only their explicit output policies.
Remaining implementation choices are workload limits and checkpoint sizing. Behavioral state and ownership are settled above.
A new input adapter produces observations or invalidations. It never needs a separate row reconstruction path.
