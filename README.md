# Hush

What is your turn on GitHub, and nothing else. A SvelteKit app (shadcn-svelte) on Cloudflare Workers: one Durable Object per user that owns that user's data (its own SQLite), D1 for accounts and sessions only, Web Push, and Atom feeds.

## How it works

```
Poller (Durable Object, one per user, alarm every 5 min; 15 min when idle)
  → GET /notifications (If-Modified-Since; a 304 is free)
  → tracked GitHub searches every 15 min (items with no recent notification)
  → GraphQL facts of changed PRs/issues (one batched request) → subjects
  → place (whose turn + your rules) → nextItemState (Done, snooze, overrides, push)
  → the user's own SQLite (items, subjects, threads, alerts…)
  → Web Push when an item comes into Your turn
Worker (Hono)  → /api/* for the SPA, /feeds/:token for Atom
Static assets  → the SPA (build/)
```

- **Items**: one row per PR, issue, or other thread (`items`, keyed `owner/repo#N` or `t:<threadId>`). Notifications (`threads`) and tracked searches are only sources of items; `subjects` holds the facts of each PR or issue.
- **Lanes**: `place()` (`src/lib/shared/place.ts`) puts each item in **Your turn** (you act next), **Waiting** (someone else acts next), or **Updates** (the rest, a feed of 14 days), from the turn rules in `turn.ts`, then your rules (first match wins; a query string, then `lane`/`push`/`mute`/`snoozeHours`).
- **Life of an item**: `nextItemState()` (`lifecycle.ts`), one pure function. Done lasts until the item's signature (the turn's reason and its newest activity) changes; “Not my turn” / “It is my turn” last until it changes; an item that leaves Your turn by itself gets a note (“You approved”); an item is pushed once per signature.
- **Seen**: each item keeps a snapshot of what you last saw; `changes.ts` lists what changed since (“+2 commits”, “CI fails”).
- **Not my turn**: each answer fixes a setting or adds a rule (`worker/poller/data.ts: notMine`), with an undo.
- **Data fetching**: TanStack Query, with the cache persisted to `localStorage` (cleared on sign-out). Tab changes use the cache; reloads show cached data at once and revalidate in the background.
- **Sign-in**: Sign in with GitHub (an OAuth app, scopes `notifications repo read:org`; the Notifications API accepts only classic and OAuth tokens). The token is stored encrypted. In Settings → Account, a user can add their own token for the same account (for example `gh auth token`), for orgs that have not approved the app; signing in again keeps it.
- **Limits**: Workers rate-limit bindings (approximate, per location): sign-in 10/min per IP, feeds 30/min per IP, API 300/min per user. Max 10 push devices per user. The poller pauses accounts with no visits for 14 days (90 with push devices); opening Hush resumes it.
- **Cheap refresh**: every change bumps the Durable Object's list version; `/api/items` answers `304 Not Modified` for a matching ETag without reading items.
- **Storage**: each user's Durable Object has their items, threads, subjects (one record of each PR or issue's facts, which every item reads), alerts, push devices, and settings (`worker/poller/schema.ts`). A schema change is a step in `MIGRATIONS`; the v1 → v2 step drops the old tables and syncs the last 14 days again. D1 has only global data: users (identity and encrypted token), sessions, and feeds.
- Shared logic lives in `src/lib/shared/` and runs in both the Worker and the browser.
- **Typed API**: the Worker's routes (`worker/routes/`) are one Hono chain, exported as `AppType`. `pnpm types:api` writes its declarations to `.api-types/` (also on install, `pnpm dev`, and `pnpm check`), and `src/lib/api.ts` calls the routes through Hono's typed client. A route that changes its path, input, or output is a type error in the browser code.

## Docs

The user docs are at [hush-gh.com/docs](https://hush-gh.com/docs): one Markdown file per page in `src/lib/docs/pages/`, in the order of `NAV` in `src/lib/docs/index.ts`. A line `{{ref:settings}}` inserts a table made from the app's own tables (settings, keybinds, query words, menus, actions, limits: `src/lib/docs/reference.ts`), and `{{key:item.done}}` a command's default keys, so the docs follow the code. Every page is also Markdown (`/docs/<page>.md`), listed in `/llms.txt`, and all in `/llms-full.txt`. `src/lib/docs/docs.test.ts` checks that every setting is documented, that every example in the docs is valid, and that every link works.

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

To test with your real account without changing anything on GitHub, add `GITHUB_WRITES=off` to `.dev.vars`: Done, Mute, and seen then do not mirror to GitHub, and the peek's GitHub actions answer 403. Test GitHub actions only in a private sandbox repository.

To test the production build (service worker, push): `pnpm preview` → http://localhost:8787.

```sh
pnpm test         # placement, lifecycle, queries, docs, Web Push encryption (against http_ece), crypto
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

The poller backs off to 3–5 min when you are idle and have no push devices. With an open tab, the lane refresh is a 304 (no item reads) unless something changed.

## Known limits (MVP)

- Hush sees what GitHub puts in your notifications and what its tracked searches find. CI or review changes with no notification are picked up by the watcher within 15 minutes.
- Fine-grained PATs cannot read the Notifications API. Use a classic PAT, or an OAuth app token (`gh auth token`) for orgs that block classic PATs.
- iOS delivers Web Push only to a Home Screen web app (iOS 16.4+).
