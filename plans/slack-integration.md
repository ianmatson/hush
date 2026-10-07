# Plan: Slack integration

## Goals

1. Send Hush alerts as Slack DMs, as well as push or in place of push. Open to all users.
2. Show Slack messages that mention a PR or issue in the peek panel. PostHog members only at first.
3. Collect 10 active workspace installs, so that Hush can go to the Slack Marketplace before paid plans start.

## Slack facts that drive the design

- **Commercial distribution needs the Marketplace.** The Slack API Terms define commercial distribution to include "a free App that connects to a paid product or service". Hush is free during the beta. Before paid plans start, the Slack app must be approved in the Marketplace, or new installs must stop.
- **Marketplace entry:** 10 or more active workspaces (used in the last 28 days), and the count must stay at 10 or more during the review. Preliminary review: up to 10 business days. Functional review: up to 10 weeks.
- **Search:** the legacy `search.messages` (`search:read`) is prohibited in the Marketplace. The Real-time Search API (`assistant.search.context`) is available only to Marketplace apps and internal apps. Unlisted distributed apps cannot use it.
- **Data rules:** no persistent copies, archives or indexes of search results. No LLM training on Slack data. Keep Slack text away from `DECISION_MODEL`.
- **One app cannot be internal and distributed.** Public distribution turns an internal app into a distributed app.

## Two Slack apps

| App                         | Type                                                | Scopes                                                                                  | Installs        | Purpose                   |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------- | ------------------------- |
| **Hush**                    | Unlisted distributed app, later the Marketplace app | Bot: `chat:write`, `im:write`                                                           | Any workspace   | Alerts; collects installs |
| **Hush Mentions (PostHog)** | Internal app in the PostHog workspace               | User: `search:read.public`, `search:read.private`, `search:read.im`, `search:read.mpim` | PostHog members | Peek mentions             |

At Marketplace submission, add the search scopes to **Hush** and remove the internal app. The PostHog workspace installs **Hush** too, and counts as one of the 10.

## Created apps

Both apps are in the PostHog workspace (`TSS5W8YQZ`). Their manifests are in `slack/`.

- **Hush:** `A0C7BMZE291`. Public distribution is not on yet. Event subscriptions are added after PR 1 is deployed, because Slack checks the request URL.
- **Hush Mentions:** `A0C72HLTBPH`. Internal app.
- **Hush (dev):** `A0C7HU26W90`. Internal app for local development, with the redirect URL `http://localhost:5173/api/slack/callback`.

## PR 1: Connect Slack (distributed app)

- Migration `0016_slack.sql`:
  - `slack_workspaces`: `team_id`, `team_name`, `bot_user_id`, encrypted bot token, `installed_at`, `updated_at`.
  - `slack_connections`: one row per Hush user: `user_id`, `team_id`, `slack_user_id`, `dm_channel_id`, `connected_at`. Deleted with the user or the workspace.
- Env: `SLACK_CLIENT_ID` (var), `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET` (secrets). With no client ID, the feature is off.
- `worker/slack.ts`: Slack Web API calls (`oauth.v2.access`, `conversations.open`, `chat.postMessage`) and request signature checks.
- `worker/routes/slack.ts`:
  - `GET /api/slack`: is Slack available, and the user's connection.
  - `GET /api/slack/connect` and `GET /api/slack/callback`: OAuth v2 with a state cookie. Org-wide Enterprise Grid installs are refused for now.
  - `DELETE /api/slack`: disconnect this user. The workspace install stays.
  - `POST /api/slack/test`: a test DM.
  - `POST /api/slack/events` (no session; Slack signature): `url_verification`, `app_uninstalled`, `tokens_revoked`.
- A Slack answer of `invalid_auth`, `account_inactive` or `token_revoked` removes the workspace and its connections.
- Settings → Notifications: a Slack card with Connect, Send test and Disconnect.
- README: development and deploy setup for the Slack app.

## PR 2: Alerts in Slack

- Setting `alertChannels: { push: boolean; slack: boolean }`. Defaults: push on, Slack on when connected.
- `worker/poller/alerts.ts`: `sendNow` sends to every enabled channel. "Delivered" means any channel accepted the message.
- `updateHasPush` becomes "has a delivery channel", so Slack-only users keep 5-minute polling.
- Block Kit message: title, body, "Open in Hush" button. A digest is one message with a list.
- Quiet hours, digests, limits, category push rules and `pushWhileOpen` apply with no change.
- Tests with a mocked Slack fetch: Slack fails and push works; connection removed on `token_revoked`.

## PR 3: Peek mentions (internal app, PostHog only)

- Phase 0 test first: does `assistant.search.context` find GitHub URLs and `owner/repo#n`? Does `OR` work? What is the rate limit? Stop if URL search is bad.
- GitHub flag (UI only): `GET /user/memberships/orgs/PostHog` with the sign-in token, at sign-in, at most once a day. Based on `checkAccess` from commit `5b3691c`. Ask a PostHog GitHub org owner to approve the Hush OAuth app first.
- Security: the internal app OAuth callback refuses any `team.id` that is not `SLACK_MENTIONS_TEAM_ID`.
- Store the encrypted user token on `slack_connections` (`mentions_token`).
- `GET /api/slack/mentions/:owner/:repo/:number`: search each time, `Cache-Control: private, no-store`, never stored.
- `peek-slack.svelte` in `peek-body.svelte`: "Mentioned in Slack (n)", channel, author, time, extract, permalink. Hidden with 0 results.

## PR 4: Docs and Marketplace preparation

- `notifications.md`, `peek.md`, `privacy.md`, `README.md`.
- Marketplace list: privacy policy, support contact, landing page, icons, install count from `slack_workspaces`.
- One post to `#hush` when alerts ship.

## Not included now

- Buttons in Slack messages (Mark done, Snooze): need an interactivity endpoint.
- Enterprise Grid org-wide installs.
- Slack mentions as a signal for categories or decisions.
