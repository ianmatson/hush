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

Every successful saved-settings write changes an access version in the same
storage put. Existing grants and pending consent then fail, including after
deleting and recreating identical view IDs. This deliberately also invalidates
grants for settings changes outside Views. Account deletion revokes all grants.
Sign-in after storage reset receives a new version.

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
Refresh checks the live application grant and access version before minting.

Grants also carry SHA-256 fingerprints of complete canonical view definitions:
searches, custom rules, grouping, sort, and closed-item preferences. Consent
compares both the version and definitions again before issuance. Reads compare
the version on every snapshot. These checks establish ordering at the acquired
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

The exported `Poller` has a private lazy active engine. Its constructor does
not migrate. `savedViewsSnapshot` directly uses the storage reader and never
initializes that engine. Existing UI RPCs, alarms, and socket events initialize
the active engine before their existing behavior. Passive reads require the
stored user ID and exact supported schema. Missing, old, unknown, or newer
schemas fail without migration, reset, alarm, or writes.

The reader uses KV caches and fixed SELECTs for subjects, snoozes and seen
snapshots. It never decrypts GitHub tokens, fetches GitHub, marks read, touches
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

The snapshot reads materialized `dash:pr` and `dash:issue` caches. Shared dashboard
helpers supply membership, grouping, sorting, closed-item retention, local
snooze/mute, unread, and changes-since-seen behavior. Stale compatible data stays
stale; incompatible caches return no items. Browser-local kind selection,
category chips, collapsed groups, held rows, and stack rotation are not saved
configuration and are not reproduced.

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
