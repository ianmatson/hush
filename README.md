# Hush

GitHub notifications that only show what needs you. A SvelteKit app (shadcn-svelte) on Cloudflare Workers: one Durable Object per user that owns that user's data (its own SQLite), D1 for accounts and sessions only, Web Push, and Atom feeds.

## How it works

```
Poller (Durable Object, one per user, alarm every ~60 s)
  → GET /notifications (If-Modified-Since; a 304 is free)
  → GraphQL enrichment of changed PRs/issues (one batched request)
  → classify (defaults + your rules)  → the user's own SQLite (threads, subjects, alerts…)
  → Web Push for new "Needs you" items
Worker (Hono)  → /api/* for the SPA, /feeds/:token for Atom
Static assets  → the SPA (build/)
```

- **Needs you** (default): direct review requests, CI failure / changes requested / conflicts / ready-to-merge on your PRs, direct human mentions, human replies in threads you are in, assignments, security alerts.
- **FYI**: everything else (team mentions, watched repos, bots, merged/closed, passing CI).
- **Rules** (Settings → Rules, JSON): first match wins; set `category` (`action`/`fyi`/`muted`) and/or `push`. Saving re-classifies stored threads.
- **Triage**: Done (also marks done on GitHub), Snooze, Mute (unsubscribes on GitHub). New activity brings a done thread back.
- **Pull requests / Issues tabs**: live GitHub searches ("sections"), grouped by whose turn it is: _Your turn_, _Your team's turn_, _Waiting on others_, _Other_. `@me` is you; `@team` runs a section once per tracked team. Edit sections, teams, scope, and filters in Settings → PRs & issues. "Hide until it changes" (`E`) hides an item until its `updatedAt` moves. The Poller caches each dashboard for 5 minutes and your teams for 6 hours.
- **Data fetching**: TanStack Query, with the cache persisted to `localStorage` (cleared on sign-out). Tab changes use the cache; reloads show cached data at once and revalidate in the background.
- **Sign-in**: Sign in with GitHub (an OAuth app, scopes `notifications repo read:org`; the Notifications API accepts only classic and OAuth tokens). The token is stored encrypted. In Settings → General, a user can add their own token for the same account (for example `gh auth token`), for orgs that have not approved the app; signing in again keeps it.
- **Access**: the `ALLOWED_ORGS` secret (comma-separated orgs; not set = anyone with a GitHub account). Sign-in checks active org membership, and the poller checks again once a day; if GitHub says the user left, Hush deletes the account and its token. A GitHub error never counts as "left".
- **Limits**: Workers rate-limit bindings (approximate, per location): sign-in 10/min per IP, feeds 30/min per IP, API 300/min per user. Max 10 push devices per user. The poller pauses accounts with no visits for 14 days (90 with push devices); opening Hush resumes it.
- **Cheap refresh**: every change bumps the Durable Object's list version; `/api/threads` answers `304 Not Modified` for a matching ETag without reading threads.
- **Storage**: each user's Durable Object has their threads, subjects (one record of each PR or issue's facts, which every view reads), alerts, push devices, dashboard marks, and settings (`worker/poller/schema.ts`). D1 has only global data: users (identity and encrypted token), sessions, and feeds.
- Shared logic lives in `src/lib/shared/` and runs in both the Worker and the browser.
- **Typed API**: the Worker's routes (`worker/routes/`) are one Hono chain, exported as `AppType`. `pnpm types:api` writes its declarations to `.api-types/` (also on install, `pnpm dev`, and `pnpm check`), and `src/lib/api.ts` calls the routes through Hono's typed client. A route that changes its path, input, or output is a type error in the browser code.

## Local development

```sh
pnpm install
pnpm keys > .dev.vars
pnpm db:migrate:local
pnpm dev          # wrangler on :8787 + vite on :5173 (proxies /api and /feeds)
```

Sign-in uses a GitHub OAuth app. For development, register a second one (github.com/settings/applications/new) with the callback `http://localhost:5173/api/auth/callback`, and add to `.dev.vars`:

```sh
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
APP_URL=http://localhost:5173
```

Then open http://localhost:5173 and choose Sign in with GitHub.
To test the production build (service worker, push): `pnpm preview` → http://localhost:8787.

```sh
pnpm test         # classifier, Web Push encryption (checked against http_ece), crypto
pnpm check        # svelte-check + Worker tsc
```

## Deploy (Cloudflare Workers Free plan)

```sh
npx wrangler login
npx wrangler d1 create hush             # paste the database_id into wrangler.jsonc
pnpm keys                                # prints three secrets
# GitHub OAuth app: callback https://app.hush-gh.com/api/auth/callback; its client ID goes in
# wrangler.jsonc (GITHUB_CLIENT_ID), the secret here:
npx wrangler secret put GITHUB_CLIENT_SECRET
# optional: npx wrangler secret put ALLOWED_ORGS  (only members of these orgs may sign in)
npx wrangler secret put TOKEN_ENC_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
# optional: npx wrangler secret put VAPID_SUBJECT  (push contact; defaults to the app URL)
pnpm run deploy                          # build + remote migrations + deploy the app and the site
```

`deploy` refreshes the wrangler login first and retries the migration step once: right after a token refresh, the D1 API can refuse the new token for a few seconds (error 7403).

Keep `TOKEN_ENC_KEY` stable: changing it makes stored tokens unreadable (users must sign in again). Changing the VAPID keys breaks existing push subscriptions.

### Free-tier budget (per user, approx.)

| Resource                | Free limit | Per user              |
| ----------------------- | ---------- | --------------------- |
| Worker requests         | 100k/day   | ~1.5k                 |
| Durable Object requests | 100k/day   | ~1.4k (one alarm/min) |
| DO rows written         | 100k/day   | only on change        |
| KV / Queues             | not used   | —                     |

The poller backs off to 3–5 min when you are idle and have no push devices. With an open tab, the inbox refresh is a 304 (no thread reads) unless something changed.

## Known limits (MVP)

- Hush sees only what GitHub puts in your notifications. CI or review changes on your PR without a new notification are picked up on the next notification for that thread.
- Fine-grained PATs cannot read the Notifications API. Use a classic PAT, or an OAuth app token (`gh auth token`) for orgs that block classic PATs.
- iOS delivers Web Push only to a Home Screen web app (iOS 16.4+).
