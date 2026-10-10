---
title: Privacy
description: What Hush stores about you, where it keeps it, who else sees it, and how to delete all of it.
---

Hush is a small open-source app. It runs your GitHub searches and reads your GitHub notifications so that it can show your lists and push what changed, and that is all it uses your data for. It has no ads and no analytics, and it does not sell or share your data. Everything below is also in [the source code](https://github.com/ianmatson/hush).

_Last updated: 9 October 2026._

## The short version

- Hush stores only what it needs to show your lists and push what changed.
- Your GitHub token is encrypted. It never goes to your browser.
- Nobody else gets your data, except the services that Hush runs on, and TypeSafe unless you turn off smart decisions (below).
- **Delete account** deletes all of it at once.

## What Hush stores

**Your account:**

- Your GitHub user id, login, name, and avatar address. Hush does not ask for your email address.
- Your GitHub token, encrypted, and its scopes. If you add a [custom token](/docs/github-access#custom-token), that one too.
- Your [settings](/docs/settings).

**What it needs to show your lists:**

- For each GitHub notification: its id and when it last changed, for 30 days. Hush uses this to find the new ones.
- For each pull request and issue in your lists or notifications: its state, author, labels, CI result, reviews and review requests, size, the first 500 characters of its description, and the 2 newest comments (their author, time, and text).
- Unless you turn off [smart decisions](/docs/settings#smartdecisions): Jev's answers for each pull request and issue (whether the newest comments need a reply from you, how urgent it is, which categories fit it, and which of your `about:` conditions it matches), and how many tokens your account used today.
- The categories of your pull requests and issues, and the ones that you chose by hand.
- The results of your searches, and the items that you snoozed or muted.
- Your teams (their names), for team review requests.

Hush does not read code. The [peek](/docs/peek) shows a PR's whole description and all its comments when you open it; Hush gets them from GitHub at that moment and does not keep them.

**For push and feeds:**

- Your alert history: the title and text of each push, for 30 days.
- For each pull request or issue that Hush pushed: when it pushed and why, for 30 days. Hush uses this to push an item only once (see [`pushRepeat`](/docs/settings#pushrepeat)).
- Pushes that wait for the end of quiet hours, a digest, or a push limit, until Hush sends them.
- Each device that gets push: the address that its browser's push service gave it, its encryption keys, and a label such as “Chrome on macOS”.
- A hash of the secret address of each [feed](/docs/feeds) that you made, not the address itself.

**For Slack, when you connect it:** see [Slack](#slack).

**To keep you signed in:** a hash of your session id, when the session started and was last used, and a label for its browser, such as “Chrome on macOS”. The session id itself is only in your browser's cookie.

## Slack

When you connect Slack in **Settings → Notifications**, Hush stores:

- For the workspace: its Slack id and name, the id of the Hush app's bot user, and the bot token, encrypted. The bot token can only send messages as the Hush app.
- For you: your Slack user id, and the id of your direct message conversation with the Hush app.

Hush sends Slack the text of your alerts, the same text as a push. It does not read your Slack messages or channels.

Hush deletes this when:

- you choose **Disconnect** (your Slack ids; the workspace stays connected for other people);
- an admin removes the Hush app from the workspace, or Slack revokes its token (everything for that workspace);
- your Slack account is deactivated (your Slack ids);
- you delete your Hush account.

**Mentions in the peek** (only for members of the PostHog GitHub org, in the PostHog Slack): Hush stores your Slack user id and a Slack user token, encrypted, that can only search messages that you can see. Hush searches Slack each time you open the peek of a PR or issue. It does not store the results, and it does not send them to Jev or any other model. Once a day at most, Hush asks GitHub if you are still in the PostHog org. **Turn off** in **Settings → Notifications → Slack**, or leaving the org, deletes the token.

## Where it is kept

Hush runs on [Cloudflare](https://www.cloudflare.com) Workers. Your lists, settings, alerts, and devices are in a database of their own for your account (a Cloudflare Durable Object). Your account, sessions, and feeds are in one shared database (Cloudflare D1).

## Who else sees it

- **GitHub**, where your data comes from. Hush sends GitHub only the requests that it needs, with your token. The app shows avatars and the images in comments from GitHub's own servers, so GitHub also sees those requests from your browser.
- **Cloudflare**, which runs Hush and stores its data. Cloudflare also keeps request logs (addresses, status codes, and errors) for a few days, which Hush uses to find bugs.
- **Slack**, if you connect it. Hush sends it your alerts, and, for mentions in the peek, a search for the PR or issue that you open.
- **Your browser's push service** (Apple, Google, Mozilla, or Microsoft) carries each push to your device. The message is encrypted for your device, so the push service cannot read it; it sees only that a message went to it.
- **TypeSafe**, unless you turn off [smart decisions](/docs/settings#smartdecisions) (on by default; turn it off in **Settings → Categories → Smart decisions**). Hush sends TypeSafe's Jev model, through Cloudflare Workers AI, the title, repository, author, labels, first 500 characters of the description, and 2 newest comments of your pull requests and issues, your GitHub login, the text of your `about:` conditions, and the names and descriptions of your categories that have a description. Cloudflare lists Jev with zero data retention: TypeSafe does not keep what it reads. Turn smart decisions off to stop this; Hush then deletes Jev's answers.

That is all. There are no analytics, tracking, or advertising services, and no third-party scripts on the site or in the app.

## Your browser

- One cookie: your session. It is `HttpOnly` and `Secure`. It ends after 7 days with no use, or 30 days after sign-in.
- Local storage: a copy of your lists (so that Hush opens at once); the comments that you started to write in the peek and did not send (for up to 30 days); your recent choices in the command palette; and the choices that are for this browser only: theme and mode, start page, tab counts, closed groups and the Pull requests or Issues choice of each view, and notes that you chose not to see again. **Sign out** clears the copy of your lists and the unsent comments.

## How long it is kept

- Notification records after 30 days, and the PR and issue facts that nothing uses for 30 days, are deleted by themselves.
- Alerts, and the record of when each item pushed, are deleted after 30 days.
- Everything else is kept until you delete your account. If you stop using Hush, it stops checking GitHub after 14 days (90 with push on), but it keeps your data until you delete it.

## Your choices

- **Delete account** in **Settings → General → Account** deletes everything above at once. It does not change anything on GitHub.
- To take back Hush's access to GitHub too, revoke Hush on GitHub: **Settings → Applications → Authorized OAuth Apps**.
- **Export** in **Settings → General → Settings file** gives you your settings as a file.
- Turn off push for a device, disconnect Slack, or turn off a feed, at any time.
- Turn off [smart decisions](/docs/settings#smartdecisions) in **Settings → Categories → Smart decisions** at any time. Hush then sends nothing more to TypeSafe, and deletes Jev's answers.

## Changes

When this page changes, the date at the top changes, and the change is in the [page's history](https://github.com/ianmatson/hush/commits/main/src/lib/about/pages/privacy.md).

## Questions

Email [support@hush-gh.com](mailto:support@hush-gh.com), or open an issue on [GitHub](https://github.com/ianmatson/hush/issues).
