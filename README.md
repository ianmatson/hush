# Hush

GitHub notifications that only show what needs you. A SvelteKit SPA (shadcn-svelte) on a single Cloudflare Worker, with D1, one Durable Object per user, Web Push, and Atom feeds.

## How it works

```
Poller (Durable Object, one per user, alarm every ~60 s)
  → GET /notifications (If-Modified-Since; a 304 is free)
  → GraphQL enrichment of changed PRs/issues (one batched request)
  → classify (defaults + your rules)  → D1 threads table
  → Web Push for new "Needs you" items
Worker (Hono)  → /api/* for the SPA, /feeds/:token for Atom
Static assets  → the SPA (build/)
```

- **Needs you** (default): direct review requests, CI failure / changes requested / conflicts / ready-to-merge on your PRs, direct human mentions, human replies in threads you are in, assignments, security alerts.
- **FYI**: everything else (team mentions, watched repos, bots, merged/closed, passing CI).
- **Rules** (Settings → Rules, JSON): first match wins; set `category` (`action`/`fyi`/`muted`) and/or `push`. Saving re-classifies stored threads.
- **Triage**: Done (also marks done on GitHub), Snooze, Mute (unsubscribes on GitHub). New activity brings a done thread back.
- **Pull requests / Issues tabs**: live GitHub searches ("sections"), grouped by whose turn it is: *Your turn*, *Your team's turn*, *Waiting on others*, *Other*. `@me` is you; `@team` runs a section once per tracked team. Edit sections, teams, scope, and filters in Settings → PRs & issues. "Hide until it changes" (`E`) hides an item until its `updatedAt` moves. The Poller caches each dashboard for 5 minutes and your teams for 6 hours.
- **Data fetching**: TanStack Query, with the cache persisted to `localStorage` (cleared on sign-out). Tab changes use the cache; reloads show cached data at once and revalidate in the background.
- Shared logic lives in `src/lib/shared/` and runs in both the Worker and the browser.

## Local development

```sh
pnpm install
pnpm keys > .dev.vars
pnpm db:migrate:local
pnpm dev          # wrangler on :8787 + vite on :5173 (proxies /api and /feeds)
```

Open http://localhost:5173 and sign in with a classic PAT (`notifications`, `repo`, `read:org`), or with an OAuth token such as `gh auth token` if your org blocks classic PATs.
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
npx wrangler secret put TOKEN_ENC_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
# optional: npx wrangler secret put VAPID_SUBJECT  (push contact; defaults to the app URL)
pnpm run deploy                          # build + remote migrations + wrangler deploy
```

Keep `TOKEN_ENC_KEY` stable: changing it makes stored tokens unreadable (users must sign in again). Changing the VAPID keys breaks existing push subscriptions.

### Free-tier budget (per user, approx.)

| Resource                | Free limit | Per user              |
| ----------------------- | ---------- | --------------------- |
| Worker requests         | 100k/day   | ~1.5k                 |
| Durable Object requests | 100k/day   | ~1.4k (one alarm/min) |
| D1 rows written         | 100k/day   | only on change        |
| KV / Queues             | not used   | —                     |

The poller backs off to 3–5 min when you are idle and have no push devices.

## Known limits (MVP)

- Hush sees only what GitHub puts in your notifications. CI or review changes on your PR without a new notification are picked up on the next notification for that thread.
- Fine-grained PATs cannot read the Notifications API. Use a classic PAT, or an OAuth app token (`gh auth token`) for orgs that block classic PATs.
- iOS delivers Web Push only to a Home Screen web app (iOS 16.4+).
