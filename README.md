# Hush for GitHub

Your GitHub pull requests and issues, with whose turn it is on each one. **[hush-gh.com](https://hush-gh.com)** · [Docs](https://hush-gh.com/docs) · [Compare](https://hush-gh.com/compare)

- **Views of your work.** Each view in the top bar is a set of GitHub searches, such as your reviews or one repository. It puts its pull requests and issues into sections: by your role, by review status, by repository, by a category group, or by the Status of a GitHub project.
- **Whose turn it is.** Each row says who must act next, and why: your review is requested, CI fails on your PR, someone replied to you. Your turn comes first.
- **Push only for facts.** You choose the facts that push (a review request, failed CI, a mention…). One alert per PR or issue, no repeats until you look, digests, limits, and quiet hours.
- **Snooze, mute, unread.** They stay in Hush. Hush only reads your GitHub notifications, and never changes them.
- **Act in place.** Review, comment, approve, and merge from the peek panel, with the keyboard.
- **Open source**, and free while it is in beta.

## Architecture

A SvelteKit app (shadcn-svelte) on Cloudflare Workers: one Durable Object per user that owns that user's data (its own SQLite), D1 for accounts and sessions only, Web Push, and Atom feeds.

A separate `McpAuthorization` Durable Object stores OAuth clients and per-user
saved-view grants. The remote MCP endpoint reads existing user data without
activating polling. See [assistant access](docs/assistant-access.md) for the
authorization, storage, and deployment boundaries.

## How it works

```
Workspace (Durable Object, one per user; plans/core-model.md)
  stored:  items (GitHub facts, project status, AI answers, your marks), sources (one result
           window per search), view state (members, closed items kept, quiet baseline), config
           and schedule, alerts
  inputs:  notifications poll (5 min; 15 when idle) → read tracked items again
           searches and boards (each every 15 min) → replace their windows, read what changed
           safety reads (1 h; 5 min while CI runs), project status, teams, Jev answers
           your actions (snooze, mute, pin, seen, settings)
  commit() (worker/workspace/commit.ts, pure): apply inputs → evaluate views → new view state,
           alerts (fact changes, new in view, snooze over) → one SQLite transaction
  evaluate (src/lib/model, pure): membership, turn, categories, unread, rows, for the app,
           feeds, and MCP alike; nothing it computes is stored
Worker (Hono)  → /api/* for the SPA, /api/live (WebSocket), /feeds/:token for Atom
Static assets  → the SPA (build/)
```

- **Store facts, compute the rest.** The Workspace keeps what GitHub said (item facts, search results), what you chose, and what a change needs to remember (each view's members, closed items it keeps for a day, its quiet baseline). Turn, categories, membership, unread, groups, and counts come from one pure evaluator whenever something reads them.
- **Notifications are only an input.** The Workspace reads them to learn quickly that a tracked PR or issue changed, then reads that item again. A notification about an item that no view tracks runs the searches again, at most every 5 minutes. Hush never writes to GitHub notifications.
- **Turn** (`shared/dashboard.ts`, `computeTurn`): whose turn it is on each item, from its facts. Bots' PRs are not your turn unless they ask your review by name; bot comments are not replies; a review request ends only when GitHub no longer asks you; new commits after your review make it your turn; a team request is your team's turn. With smart decisions on, Jev decides whether new comments need a reply.
- **Alerts** (`worker/workspace/commit.ts`, `deliver.ts`): each commit compares what it read with what it had and makes at most one alert per item from the facts that you chose (review requested, mentioned, replied, CI failed…), a view's new items (`pushNew`), and the end of a snooze. Delivery applies quiet hours, digests, limits, and repeats, and records each send per channel.
- **Views** (`/v/<id>`): each view is up to 5 GitHub searches; its page shows its pull requests, its issues, or both, in sections chosen by its Group by (`shared/grouping.ts`). `@me` is you; `@team` runs a search once per tracked team. Each search's Hush words filter only that search's results (`src/lib/model/compile.ts`). Snooze takes an item out of a view until new activity, a time, or an event; Mute until you unmute it. An item is unread until you look at it, and again when it changes.
- **Categories** (`shared/categories.ts`, `src/lib/model/eligibility.ts`): category groups place each PR or issue by a pin, a rule, or Jev. An answer that Jev has not given yet is unknown, not false.
- **Data fetching**: one TanStack query (`/api/items`) has every row with the views it is in, with the cache persisted to `localStorage` (cleared on sign-out). The live socket says when it changed.
- **Sign-in**: Sign in with GitHub (an OAuth app, scopes `notifications repo read:org project`; the Notifications API accepts only classic and OAuth tokens). The token is stored encrypted. In Settings → General, a user can add their own token for the same account (for example `gh auth token`), for orgs that have not approved the app; signing in again keeps it.
- **Limits**: Workers rate-limit bindings (approximate, per location): sign-in 10/min per IP, feeds 30/min per IP, API 300/min per user. Each Workspace run makes at most 40 GitHub requests and stops at a rate limit. Max 10 push devices per user. The Workspace pauses accounts with no visits for 14 days (90 with push devices); opening Hush resumes it.
- **Live updates**: each open tab holds one WebSocket to its user's Durable Object (`/api/live`), which says what changed, so tabs do not poll.
- **Storage**: each user's Workspace has five SQLite tables (`worker/workspace/store.ts`): items, sources, view state, state (config, schedule, push devices), and alerts. D1 has only global data: users (identity and encrypted token), sessions, and feeds. The old `Poller` Durable Object only gives its saved settings to a new Workspace once.
- Shared logic lives in `src/lib/shared/` and `src/lib/model/`, and runs in both the Worker and the browser.
- **Typed API**: the Worker's routes (`worker/routes/`) are one Hono chain, exported as `AppType`. `pnpm types:api` writes its declarations to `.api-types/` (also on install, `pnpm dev`, and `pnpm check`), and `src/lib/api.ts` calls the routes through Hono's typed client. A route that changes its path, input, or output is a type error in the browser code.

## Docs

The user docs are at [hush-gh.com/docs](https://hush-gh.com/docs): one Markdown file per page in `src/lib/docs/pages/`, in the order of `NAV` in `src/lib/docs/index.ts`. A line `{{ref:settings}}` inserts a table made from the app's own tables (settings, keybinds, query words, menus, actions, limits: `src/lib/docs/reference.ts`), `{{key:dash.snooze}}` a command's default keys, and `{{value:max-views}}` one value from the code, such as a limit or Hush's price (`VALUES` in `reference.ts`), so the docs follow the code. Every page of the site (docs, guides, comparisons, and the pricing, privacy, and security pages) is in `SITE_PAGES` (`src/lib/site-pages.ts`): each one is also Markdown (`/docs/<page>.md`; the home page of a section is `/docs/index.md`), listed in `/llms.txt`, all in `/llms-full.txt`, and in `/sitemap.xml`. `src/lib/docs/docs.test.ts` checks that every setting is documented, that every example in the docs is valid, and that every link works.

## Local development

The [authenticated remote MCP server](docs/assistant-access.md) provides passive
cached reads of explicitly approved saved views at `${APP_URL}/mcp`. Connect and
revoke apps in Settings → Authorized apps. The code includes OAuth discovery,
S256 PKCE consent, expiry, and per-user/per-view grants. Deployment and live
authorization require a separate approved operation.

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

To test with your real account without changing anything on GitHub, add `GITHUB_WRITES=off` to `.dev.vars`: the peek's GitHub actions then answer 403. Test GitHub actions only in a private sandbox repository: with `GITHUB_WRITES=off`, add `GITHUB_WRITES_ALLOW=owner/sandbox` (a comma-separated list) to allow the peek's actions, reactions, Viewed marks, and review comments there and nowhere else. Project board changes stay off.

To test the production build (service worker, push): `pnpm preview` → http://localhost:8787.

[Paseo](https://paseo.sh) worktrees set themselves up from `paseo.json`: `scripts/setup-worktree.sh` installs packages, copies `.dev.vars` and the local Wrangler state (D1, Durable Objects) from the main checkout, and applies the local migrations. The `dev` service runs `pnpm dev` on :5173, the port that the development OAuth callbacks use, so one worktree at a time can run it. Vite listens on `127.0.0.1` only, which the Paseo service proxy needs.

```sh
pnpm test         # turn rules, push facts, Web Push encryption (checked against http_ece), crypto
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

### Webhooks from the GitHub App (optional)

A GitHub App sends webhooks for the orgs that install it (built in #93 and #94). It does not replace the OAuth app: sign-in, reads, searches, and notifications still use each user's OAuth token. A webhook only makes the Workspaces that track the item read it again. Without `GITHUB_APP_ID` and `GITHUB_WEBHOOK_SECRET` the feature is off: `/api/github/webhook` answers 404 and the daily cron does nothing.

Local development uses **Hush GH (dev)** (`hush-gh-dev`, installable only on `@ianmatson`). Its permissions are read-only Metadata, Pull requests, Issues, and Checks, and it subscribes to Check suite, Issue comment, Issues, Pull request, Pull request review, Pull request review comment, and Pull request review thread. Add to `.dev.vars` (the private key as PKCS#8, on one line with `\n`):

```sh
GITHUB_APP_ID=…
GITHUB_APP_SLUG=…
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET=…
```

`pnpm webhook:replay <event> <payload.json>` signs a payload with the local secret and posts it to `:8787` (samples are in `worker/test/fixtures/webhooks/`). For real deliveries, run `cloudflared tunnel --url http://localhost:8787` and set the app's Webhook URL to the tunnel plus `/api/github/webhook`. Trigger the daily route cleanup with `curl http://localhost:8787/cdn-cgi/local/scheduled`.

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
# optional, GitHub App webhooks (README → Webhooks from the GitHub App):
#   npx wrangler secret put GITHUB_APP_ID
#   npx wrangler secret put GITHUB_APP_SLUG
#   npx wrangler secret put GITHUB_APP_PRIVATE_KEY
#   npx wrangler secret put GITHUB_WEBHOOK_SECRET
pnpm run deploy                          # build + remote migrations + deploy the app and the site
```

Each pull request runs `pnpm check`, `pnpm test`, and `pnpm lint` (`.github/workflows/ci.yml`). Each push to `main` deploys with GitHub Actions (`.github/workflows/deploy.yml`): it runs `pnpm check`, `pnpm test`, `pnpm lint`, and `pnpm run deploy`. It needs two repository secrets: `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` with the permissions Workers Scripts: Edit, D1: Edit, Workers Routes: Edit (zone hush-gh.com), and DNS: Edit (zone hush-gh.com, for the custom domains). Run it by hand from the Actions tab with **Run workflow**.

`deploy` refreshes the wrangler login first and retries the migration step once: right after a token refresh, the D1 API can refuse the new token for a few seconds (error 7403).

Keep `TOKEN_ENC_KEY` stable: changing it makes stored tokens unreadable (users must sign in again). Changing the VAPID keys breaks existing push subscriptions.

### Free-tier budget (per user, approx.)

| Resource                | Free limit | Per user                                 |
| ----------------------- | ---------- | ---------------------------------------- |
| Worker requests         | 100k/day   | ~1.5k                                    |
| Durable Object requests | 100k/day   | ~0.3–1k (one alarm for each due check)   |
| DO rows written         | 100k/day   | changed records and schedule checkpoints |
| KV / Queues             | not used   | —                                        |

With the GitHub App, every delivery of an installed org is one Worker request and one D1 read, also when nobody tracks the item. A tracked item adds one Durable Object request for each user who tracks it (at most 60 a minute for each user), and route sync writes one D1 row for each item that joins or leaves a user's views. Measure an org's delivery volume before you install the app there: above about 30,000 deliveries a day, install it on selected repositories only.

The Workspace sets its alarm for the next due check only: notifications every 5 minutes (15 when you are idle and have no alert channel), the searches of your views every 15 minutes, and item reads when something changed. Open tabs get changes over their WebSocket, so they do not poll.

## Known limits (MVP)

- Hush sees only the PRs and issues that your view searches find. CI or review changes with no new notification show when Hush reads the item again: within an hour, every 5 minutes while its CI runs, or at the next notification for it.
- Fine-grained PATs cannot read the Notifications API. Use a classic PAT, or an OAuth app token (`gh auth token`) for orgs that block classic PATs.
- iOS delivers Web Push only to a Home Screen web app (iOS 16.4+).
