# Hush for GitHub

GitHub notifications that only show what needs you. **[hush-gh.com](https://hush-gh.com)** · [Docs](https://hush-gh.com/docs) · [Compare](https://hush-gh.com/compare)

- **Needs you, or FYI.** Hush reads the pull request or issue behind each notification and sorts it: review requests, failed CI on your PRs, replies, and mentions need you; the rest is FYI.
- **Whose turn is it?** The Pull requests and Issues tabs group your work into your turn, your team's turn, and waiting on others.
- **Push that respects you.** One alert per PR or issue, no repeats until you look, digests, limits, and quiet hours.
- **Act in place.** Review, comment, approve, and merge from the peek panel, with the keyboard.
- **Open source**, and free while it is in beta.

## Architecture

A SvelteKit app (shadcn-svelte) on Cloudflare Workers: one Durable Object per user that owns that user's data (its own SQLite), D1 for accounts and sessions only, Web Push, and Atom feeds.

## How it works

```
Poller (Durable Object, one per user, alarm every 5 min; 15 min when idle)
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
- **Pull requests / Issues tabs**: live GitHub searches ("sections"), grouped by whose turn it is: _Your turn_, _Your team's turn_, _Waiting on others_, _Other_. `@me` is you; `@team` runs a section once per tracked team. Edit sections, teams, scope, and filters in Settings → PRs & issues. "Hide until it changes" (`E`) hides an item until its `updatedAt` moves. The Poller caches each dashboard for 15 minutes and your teams for 6 hours.
- **Data fetching**: TanStack Query, with the cache persisted to `localStorage` (cleared on sign-out). Tab changes use the cache; reloads show cached data at once and revalidate in the background.
- **Sign-in**: Sign in with GitHub (an OAuth app, scopes `notifications repo read:org project`; the Notifications API accepts only classic and OAuth tokens). The token is stored encrypted. In Settings → General, a user can add their own token for the same account (for example `gh auth token`), for orgs that have not approved the app; signing in again keeps it.
- **Limits**: Workers rate-limit bindings (approximate, per location): sign-in 10/min per IP, feeds 30/min per IP, API 300/min per user. Max 10 push devices per user. The poller pauses accounts with no visits for 14 days (90 with push devices); opening Hush resumes it.
- **Cheap refresh**: every change bumps the Durable Object's list version; `/api/threads` answers `304 Not Modified` for a matching ETag without reading threads.
- **Storage**: each user's Durable Object has their threads, subjects (one record of each PR or issue's facts, which every view reads), alerts, push devices, dashboard marks, and settings (`worker/poller/schema.ts`). D1 has only global data: users (identity and encrypted token), sessions, and feeds.
- Shared logic lives in `src/lib/shared/` and runs in both the Worker and the browser.
- **Typed API**: the Worker's routes (`worker/routes/`) are one Hono chain, exported as `AppType`. `pnpm types:api` writes its declarations to `.api-types/` (also on install, `pnpm dev`, and `pnpm check`), and `src/lib/api.ts` calls the routes through Hono's typed client. A route that changes its path, input, or output is a type error in the browser code.

## Docs

The user docs are at [hush-gh.com/docs](https://hush-gh.com/docs): one Markdown file per page in `src/lib/docs/pages/`, in the order of `NAV` in `src/lib/docs/index.ts`. A line `{{ref:settings}}` inserts a table made from the app's own tables (settings, keybinds, query words, menus, actions, limits: `src/lib/docs/reference.ts`), and `{{key:inbox.done}}` a command's default keys, so the docs follow the code. Every page is also Markdown (`/docs/<page>.md`), listed in `/llms.txt`, and all in `/llms-full.txt`. `src/lib/docs/docs.test.ts` checks that every setting is documented, that every example in the docs is valid, and that every link works.

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

To test with your real account without changing anything on GitHub, add `GITHUB_WRITES=off` to `.dev.vars`: Done, Read, and Mute then do not mirror to GitHub, and the peek's GitHub actions answer 403. Test GitHub actions only in a private sandbox repository.

To test the production build (service worker, push): `pnpm preview` → http://localhost:8787.

[Paseo](https://paseo.sh) worktrees set themselves up from `paseo.json`: `scripts/setup-worktree.sh` installs packages, copies `.dev.vars` and the local Wrangler state (D1, Durable Objects) from the main checkout, and applies the local migrations. The `dev` service runs `pnpm dev` on :5173, the port that the development OAuth callbacks use, so one worktree at a time can run it. Vite listens on `127.0.0.1` only, which the Paseo service proxy needs.

To test from a browser on another machine, such as a Paseo desktop app that connects through the relay, run `pnpm dev:tailnet` (Paseo script `tailnet`). It makes the dev server available at this machine's Tailscale address, on the same port. GitHub sign-in needs `localhost:5173`, so on another address, `pnpm dev:session [login]` makes a 24-hour session in the local database for a user who signed in before, and prints the line that sets its cookie.

```sh
pnpm test         # classifier, Web Push encryption (checked against http_ece), crypto
pnpm check        # svelte-check + Worker tsc
```

### Slack (optional)

Slack alerts use the **Hush** Slack app (`A0C7BMZE291`, public distribution). Users connect Slack in **Settings → Notifications** ([docs](https://hush-gh.com/docs/notifications#slack)). Peek mentions use **Hush Mentions** (`A0C72HLTBPH`, internal to the PostHog workspace). Without `SLACK_CLIENT_ID`, Settings shows no Slack alerts.

Peek mentions are on only with `SLACK_MENTIONS_CLIENT_ID`, `SLACK_MENTIONS_CLIENT_SECRET`, `SLACK_MENTIONS_TEAM_ID`, and `SLACK_MENTIONS_GITHUB_ORG`. Hush shows them only to active members of that GitHub org (checked at most once a day with the sign-in token, or with your own token when the org hides the membership from the sign-in token), and the OAuth callback refuses any Slack workspace other than `SLACK_MENTIONS_TEAM_ID`. The PostHog GitHub org must approve the Hush OAuth app, or GitHub hides the membership. Search results are never stored: each peek searches Slack again.

Each app's manifest is in `slack/<app>/manifest.json`. Change the manifest there, then push it with the Slack CLI:

```sh
cd slack/hush && slack manifest sync --app A0C7BMZE291
```

The client ID, client secret, and signing secret are on the app's Basic Information page.

A distributed Slack app accepts only HTTPS redirect URLs, so local development uses **Hush (dev)** (`A0C7HU26W90`, `slack/hush-dev/`), which is not distributed and redirects to `http://localhost:5173/api/slack/callback`. Add its values to `.dev.vars`:

```sh
SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…
SLACK_SIGNING_SECRET=…
SLACK_MENTIONS_CLIENT_ID=…
SLACK_MENTIONS_CLIENT_SECRET=…
```

**Hush Mentions** is internal, so it also redirects to `http://localhost:5173/api/slack/mentions/callback`.

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
# optional, Slack alerts (SLACK_CLIENT_ID is in wrangler.jsonc):
#   npx wrangler secret put SLACK_CLIENT_SECRET
#   npx wrangler secret put SLACK_SIGNING_SECRET
# optional, peek mentions (SLACK_MENTIONS_TEAM_ID and SLACK_MENTIONS_GITHUB_ORG are in wrangler.jsonc;
# add SLACK_MENTIONS_CLIENT_ID there):
#   npx wrangler secret put SLACK_MENTIONS_CLIENT_SECRET
pnpm run deploy                          # build + remote migrations + deploy the app and the site
```

Each push to `main` deploys with GitHub Actions (`.github/workflows/deploy.yml`): it runs `pnpm check`, `pnpm test`, and `pnpm run deploy`. It needs two repository secrets: `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` with the permissions Workers Scripts: Edit, D1: Edit, Workers Routes: Edit (zone hush-gh.com), and DNS: Edit (zone hush-gh.com, for the custom domains). Run it by hand from the Actions tab with **Run workflow**.

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
