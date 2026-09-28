---
title: Privacy
description: What Hush stores about you, where it keeps it, who else sees it, and how to delete all of it.
---

Hush is a small open-source app. It reads your GitHub notifications so that it can sort them for you, and that is all it uses your data for. It has no ads and no analytics, and it does not sell or share your data. Everything below is also in [the source code](https://github.com/ianmatson/hush).

_Last updated: 28 September 2026._

## The short version

- Hush stores only what it needs to sort your notifications and show your lists.
- Your GitHub token is encrypted. It never goes to your browser.
- Nobody else gets your data, except the services that Hush runs on (below).
- **Delete account** deletes all of it at once.

## What Hush stores

**Your account:**

- Your GitHub user id, login, name, and avatar address. Hush does not ask for your email address.
- Your GitHub token, encrypted, and its scopes. If you add a [custom token](/docs/github-access#custom-token), that one too.
- Your [settings](/docs/settings).

**What it needs to sort your notifications:**

- Your items (from your notifications and Hush's GitHub searches): the repository, the title, the link, why GitHub notified you, its lane, what it looked like when you last saw it, and what you did with it (Done, Snoozed, Muted, Not my turn).
- For each pull request and issue behind them: its state, author, labels, CI result, reviews and review requests, size, and the newest comment (its author, time, and text).
- The results of your Pull requests and Issues searches, and the items that you hid or moved there.
- Your teams (their names), for team review requests.

Hush does not read code. The [peek](/docs/peek) shows a PR's description and comments when you open it; Hush gets them from GitHub at that moment and does not keep them.

**For push and feeds:**

- Your alert history: the title and text of each push, for 30 days.
- Each device that gets push: the address that its browser's push service gave it, its encryption keys, and a label such as “Chrome on macOS”.
- A hash of the secret address of each [feed](/docs/feeds) that you made, not the address itself.

**To keep you signed in:** a hash of your session id, when the session started and was last used, and a label for its browser, such as “Chrome on macOS”. The session id itself is only in your browser's cookie.

## Where it is kept

Hush runs on [Cloudflare](https://www.cloudflare.com) Workers. Your notifications, lists, settings, alerts, and devices are in a database of their own for your account (a Cloudflare Durable Object). Your account, sessions, and feeds are in one shared database (Cloudflare D1).

## Who else sees it

- **GitHub**, where your data comes from. Hush sends GitHub only the requests that it needs, with your token. The app shows avatars and the images in comments from GitHub's own servers, so GitHub also sees those requests from your browser.
- **Cloudflare**, which runs Hush and stores its data. Cloudflare also keeps request logs (addresses, status codes, and errors) for a few days, which Hush uses to find bugs.
- **Your browser's push service** (Apple, Google, Mozilla, or Microsoft) carries each push to your device. The message is encrypted for your device, so the push service cannot read it; it sees only that a message went to it.

That is all. There are no analytics, tracking, or advertising services, and no third-party scripts on the site or in the app.

## Your browser

- One cookie: your session. It is `HttpOnly` and `Secure`. It ends after 7 days with no use, or 30 days after sign-in.
- Local storage: a copy of your lists (so that Hush opens at once), and the choices that are for this browser only: theme and mode, start page, tab counts, and notes that you chose not to see again. **Sign out** clears the copy of your lists.

## How long it is kept

- Updates, and Done or muted items, with no activity for 30 days, and the PR and issue facts that nothing uses for 30 days, are deleted by themselves.
- Alerts are deleted after 30 days.
- Everything else is kept until you delete your account. If you stop using Hush, it stops checking GitHub after 14 days (90 with push on), but it keeps your data until you delete it.

## Your choices

- **Delete account** in **Settings → Account** deletes everything above at once. It does not change anything on GitHub.
- To take back Hush's access to GitHub too, revoke Hush on GitHub: **Settings → Applications → Authorized OAuth Apps**.
- **Export** in **Settings → Account → Settings file** gives you your settings as a file.
- Turn off push for a device, or turn off a feed, at any time.

## Changes

When this page changes, the date at the top changes, and the change is in the [page's history](https://github.com/ianmatson/hush/commits/main/src/lib/about/pages/privacy.md).

## Questions

Open an issue on [GitHub](https://github.com/ianmatson/hush/issues).
