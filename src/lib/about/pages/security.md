---
title: Security
description: For you and your org's owners, what Hush can do with GitHub access, how it keeps your token safe, and how to report a problem.
---

Hush needs access to your GitHub notifications and repositories. This page says what it does with that access, and how it protects it. If you own a GitHub org and a member asks you to approve Hush, start with [For org owners](#for-org-owners).

## What Hush can do on GitHub

Hush signs you in with a GitHub OAuth app, with the scopes `notifications`, `repo`, and `read:org`. GitHub's Notifications API accepts only these classic scopes, so Hush cannot ask for less.

- **Hush reads** your notifications, the pull requests and issues behind them, the results of your saved searches, and your teams.
- **Hush writes only when you do it.** Each write is one choice that you make in Hush: Done, Mute, or Read on a notification; or approve, request changes, comment, merge, auto-merge, re-run failed jobs, close, or reopen in the [peek](/docs/peek). A thread that you read in the peek is marked as read on GitHub; you can [turn this off](/docs/settings#peekmarksread).
- Hush never writes by itself: no rule, schedule, or background job changes anything on GitHub.
- Hush does not read code, change repositories or settings, or use admin rights.

## For org owners

Your org may allow only the OAuth apps that an owner approved. Until you approve Hush, GitHub hides your org's private repositories and notifications from Hush.

When you approve Hush, each member who signs in to Hush can use it with their own access, and no more: Hush sees what that member sees, and it acts as that member, only when they choose an action. Approval gives Hush no access of its own to your org.

You can deny or revoke the approval at any time in your org's settings, under **Third-party access → OAuth app policy**. Members can revoke Hush for themselves in their own GitHub settings.

## How Hush protects your access

- **Your token is encrypted** with AES-256-GCM before Hush stores it. The key is a secret of the server, not in the database. Hush decrypts the token only on the server, to call GitHub, and never sends it to your browser.
- **Sessions:** your browser keeps a random 256-bit session id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The server stores only its SHA-256 hash. A session ends after 30 days, or when you sign out.
- **Sign-in** uses a random `state` value, so that another site cannot finish a sign-in for you.
- **Requests that change things** must come from Hush's own address; others are refused.
- **Your data is separate:** each account has a database of its own (a Cloudflare Durable Object).
- **Feeds** have a random secret address of 192 bits. Turning a feed off makes its address stop working at once.
- **Push messages** are encrypted for your device (Web Push, with VAPID keys), so the push services that carry them cannot read them.
- **Limits** on the number of requests protect sign-in, feeds, and the API against floods.
- **The public site** is static HTML, with a strict Content Security Policy: it runs no scripts from other sites.

## Open source

All of Hush is at [github.com/ianmatson/hush](https://github.com/ianmatson/hush): the app, the server, and this site. What runs is the `main` branch. You can read what Hush does with your token, or run your own copy on your own Cloudflare account (see the README).

## Report a problem

If you find a security problem, please do not describe it in a public issue. Open an [issue](https://github.com/ianmatson/hush/issues) that says only that you found one, and we will set up a private way to talk. Thank you.
