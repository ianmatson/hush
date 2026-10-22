# Authenticated remote access to saved views

Hush serves a remote MCP endpoint at `${APP_URL}/mcp`. Registering an OAuth
client grants no data. A signed-in user must approve specific saved views.

## Connect and manage access

1. Sign in to Hush first.
2. Add the server address from Settings → Authorized apps to the MCP client.
3. Start the connection from that client. Check its name and return address.
   App names are self-asserted. For a loopback return address, continue only if
   you just started the connection from an app on your computer.
4. Select the views to share. None are selected by default.
5. Inspect permissions, views, expiry, and revoke access in Authorized apps.
   To change allowed views, revoke access and connect again.

Clients need public-client authorization code flow, S256 PKCE, Dynamic Client
Registration (DCR), and `saved-views:read`. Authorization and token requests must
name the exact resource `${APP_URL}/mcp`. Access tokens last 15 minutes.
Rotating refresh tokens and application grants last at most 30 days. Consent
lasts 10 minutes and works once. New views are never included automatically.

Settings saves compare a shared semantic authorization projection. No-op saves,
notification/input/row preferences, view names/order, sort order, new-item push choices,
and changes between basic grouping modes preserve existing grants and pending
consent. Basic grouping uses only item fields already returned: none, role,
status, repository, author, label, and assignee. Custom section names can change
without changing their rules. Presentation changes can change pagination revisions.

The projection retains view IDs, searches (including Hush filters), effective
closed-item retention, custom rules, category/project/custom grouping, all source
settings in `dash`, and smart-decision enablement. Category definitions, including
names, descriptions, rules, order, and IDs, are included when a source or section
uses categories or a view groups by category. Direct `about:` conditions are
not allowed in source searches or custom sections; they enter through category
rules, whose AI inputs and descriptions are retained.
All category groups are retained in these cases because rules and smart-decision
inputs can depend on other groups. Unused categories do not affect authority.
Only known presentation fields are removed; unknown fields remain in the
comparison, including unknown sort and section fields.

An authorization change creates a random access version and clears compatibility
fingerprints. Settings, version, and compatibility fingerprints commit in one
Durable Object storage transaction. Concurrent saves compare against the previous
committed settings. A failed transaction preserves all three. The version is
global per account: a sensitive change to any saved view invalidates all grants
and pending consent, even when that view was not granted. Deleting and recreating
an identical view ID cannot restore a grant. Account deletion revokes all grants.
Missing access versions always receive a random version on save. Sign-in after
storage reset also receives a random version.

Existing grants with a current stored random access version remain valid. New
fingerprints use a `v2:` semantic projection. On the first harmless save, the
transaction preserves one original full-definition fingerprint per view for that
same access version. This bounded compatibility record lets old grants and
pending consent survive presentation edits without changing OAuth records on
reads. Exact old fingerprints also work before the first save. A legacy grant
issued with the fallback `initial` value when no version was stored requires
reconnection after the first save or sign-in. Already-invalid versions are never
restored. No database migration or passive-read write is required.

## Standards and library choices

Pinned dependencies: `@cloudflare/workers-oauth-provider` 1.2.3,
`@modelcontextprotocol/server` 2.3.1, and Zod 4.3.6. Official sources checked
on 2026-10-21:

- [MCP authorization, released 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Cloudflare authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
- [Cloudflare SDK v2 migration](https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/)
- [OAuth provider source and documentation](https://github.com/cloudflare/workers-oauth-provider).
  The installed package includes its authorization, resource, and consent references.

The SDK's `createMcpHandler` serves the current per-request protocol and stateless
Streamable HTTP for 2025 clients. Only `list_views` and `get_view` are exposed.
There are no persistent MCP sessions, proxy tools, arbitrary SQL or caller-selected
storage. Bearer authentication is required on every call. Browser cookies never
authenticate MCP. GitHub tokens stay server-side and never become MCP credentials.

DCR supports existing clients, although the current specification prefers Client
ID Metadata Documents (CIMD). CIMD, arbitrary metadata fetches, external tokens,
token exchange, confidential clients, and private-use redirects are disabled.
The library validates registered HTTPS/loopback redirects, rejects credentials
and fragments, and enforces S256 PKCE. Registration alone conveys no authority.

| Endpoint                                    | Purpose                                     |
| ------------------------------------------- | ------------------------------------------- |
| `/.well-known/oauth-protected-resource/mcp` | Resource metadata                           |
| `/.well-known/oauth-authorization-server`   | Issuer metadata                             |
| `/oauth/authorize`                          | Browser authentication and consent start    |
| `/oauth/token`                              | Code exchange, refresh, RFC 7009 revocation |
| `/oauth/register`                           | Public client registration                  |
| `/api/mcp/consent`                          | Session-bound consent data and decision     |
| `/api/mcp/grants`                           | Current user's authorized apps              |
| `/api/mcp/grants/:id/revoke`                | Current user's revocation                   |

The application enforces the narrow scope, exact resource/audience, expiry,
live application grant, live provider grant, current user, and saved-view scope.
It rejects missing stored audiences rather than using the library's compatibility
fallback. A browser session lookup checks absolute and idle expiry without
touching or refreshing the session. Consent binds to user, session, browser
cookie, and CSRF token. Management writes require exact same-origin Origin and
session-derived CSRF. Consent HTML forbids framing and uses no-referrer.
Expected consent errors become response data inside the DO, without relying
on exception prototypes surviving RPC.

Cross-origin browser JavaScript MCP clients are not enabled. Supported native
and server-side clients omit Origin, or use Hush's own origin.

## Storage, replay, revocation, and capacity

`McpAuthorization` is a separate SQLite-backed Durable Object. A KV-shaped adapter
stores library records in strongly consistent DO storage, not Workers KV.
One private queue serializes all protocol operations. Concurrent exchanges
cannot read the same unconsumed code. The library removes the code's wrapped
key before token issuance. A crash can require a new connection, but does not
make a consumed code reusable.

The application obtains the library grant ID through supported grant metadata
and listing helpers. It does not parse authorization codes to obtain authority.
Explicit revocation first stores retry metadata and removes the application
grant, then calls `revokeGrant` to delete the provider family. Failure preserves
immediate data denial and retry metadata. Later explicit writes retry cleanup.
Refresh checks the live application grant, access version, and approved view
fingerprints before minting.

Grants also carry SHA-256 fingerprints of canonical semantic view definitions.
Consent compares both the version and approved fingerprints again before
issuance. Reads compare the version and view fingerprints on every snapshot.
These checks establish ordering at the acquired
snapshot; they do not cancel a read that already acquired an earlier snapshot.
Revocation affects subsequent calls.

The global authorization object is a deliberate small-service serialization
point. Limits are 1,000 stored clients, 100 pending consents globally, and 20
application grants per user. Client registrations last 30 days and the library
can renew active registrations during token exchange. Capacity failures deny
new access. Explicit OAuth writes scan at most 100 records per operation with
a persisted cleanup cursor. Expired records are unreadable immediately.
Physical deletion can lag when there are no writes. No cleanup alarm exists.

Authorization, registration, token exchange, and consent writes use AUTH_LIMIT
(10/minute/IP). MCP calls, metadata, consent HTML, and management reads use
API_LIMIT (300/minute/IP). The 64 KiB body cap and these middleware apply only
to MCP/OAuth paths. Normal Hush budgets and body sizes do not change.

## Passive reads and output boundaries

The exported `Workspace` opens its engine lazily. `savedViewsSnapshot` reads
storage directly and never opens the engine. UI RPCs, alarms, and socket events
open the engine first. Passive reads require the stored account to match the
principal and the Workspace tables to exist; otherwise they fail without
migration, reset, alarm, or writes.

The reader loads the Workspace tables with SELECTs and two KV values (the access
version and legacy fingerprints). It never decrypts GitHub tokens, fetches GitHub, marks read, touches
activity, resumes polling, refreshes sessions/caches, or writes facts, decisions,
alerts, or last-used telemetry. Inspection of the pinned library confirms that
`unwrapToken` and `validateToken` only read/decrypt token records. Validation uses
an adapter whose mutation methods throw. Issuance, refresh, consent, revocation,
and their bounded cleanup are explicit write flows, not passive reads.

Both tools filter definitions to the grant. Each item uses an explicit output
allowlist. Other view membership/kept sections, source queries and filters,
unrelated categories, category rules/settings, project fields, outside stack
members, global errors, and outside counts are removed. Grouping uses full
internal facts before filtering output.

The snapshot evaluates the stored items, search results, and view state with the
same pure evaluator as the app (`src/lib/model`), so membership, grouping,
sorting, closed-item retention, snooze/mute, unread, and changes-since-seen match
the app for the same stored revision and time. Stale data stays stale: `get_view`
reports it in `freshness` (stale, unknown, or truncated searches, and skipped
team searches). Browser-local kind selection, category chips, collapsed groups,
held rows, and stack rotation are not saved configuration and are not
reproduced.

`list_views({ limit?, cursor? })` returns granted definitions in saved order.
`get_view({ view_id, kind?: 'both' | 'pr' | 'issue', limit?, cursor? })` returns
visible cached items in saved groups. Pages contain 1–100 rows, default 50.
Cursors bind to account, grant ID, effective scope, requested view/kinds, and
content revision. `snapshot_changed` requires restarting pagination. Missing
and ungranted views share `view_not_found`. Cache states are `fresh`, `stale`,
`missing`, or `settings_changed`, with `fetchedAt`. Remote results conservatively
report `complete: false` because global source errors are hidden. GitHub text
is untrusted content, never assistant instructions.

## Verification and deployment boundary

Run `pnpm check`, `pnpm test`, and `pnpm lint`.
`node tests/mcp-workerd.mjs` uses Wrangler's installed Miniflare/esbuild for
real workerd/DO RPC tests, synthetic local D1/DO data, ephemeral storage, and
blocked external fetches. It reads no .dev.vars, existing Wrangler state, or
browser profiles. `tests/mcp-ui.mjs` uses isolated headless fixtures with a
configured existing dev service; environment options are at the file's top.

The package adds MCP_AUTH and the v2-mcp-authorization DO class migration to
Wrangler configuration. No D1 schema migration, new live secret, or provider
credential is needed. Deployment is separate: review capacity limits, check
canonical HTTPS APP_URL, deploy the DO binding/class and Worker/assets together,
then run a separately approved live connection test. Changing APP_URL's origin
invalidates the resource binding. Do not deploy only the UI or only the endpoint.

No deployment, remote migration, live credential, real grant, real third-party
consent, or production/browser-account test is part of this validation.
Screenshots and GIFs stay outside the repository. Public permanent uploads
require approval of the exact files first.
