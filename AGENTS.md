# AGENTS.md

Read [README.md](README.md) for the architecture and for local development.

## PRs

- _Any_ visual change must have before/after screenshots of all affected areas. Show each area in a narrow window and a wide window, in both light and dark mode. If many areas change, think about breaking the PR up.
- If the change animates, transitions, or responds to hover, focus, drag, or scroll, add a before/after GIF as well. A still cannot show motion. The GIF is extra: the four stills are still required.
- If your environment cannot take screenshots, that is a blocker. Do not open the PR until the user gives you the screenshots.
- If you cannot capture a state, name it in a "Not tested" line in the PR description, with the reason.

### Taking screenshots

1. Start the app with `pnpm dev` and open http://localhost:5173. To keep GitHub unchanged while you test, set `GITHUB_WRITES=off` in `.dev.vars`.
   - In Paseo, start the `dev` service, not a `pnpm dev` of your own: the service proxy and the port belong to it.
   - Paseo opens a new browser tab on the desktop app that connected to the daemon last, which can be on another machine. Check `navigator.userAgent` in `browser_evaluate`. If the tab is not on this machine, its `localhost` is not this machine: ask the user to reload the Paseo app window on this machine (⌘R), then open a new tab.
   - Sign in at http://localhost:5173/api/auth/github. Never click Authorize on GitHub for the user.
2. Capture the before state first. Set your work aside with a temporary WIP commit, not a bare `git stash` (other agents share the stash stack).
3. Use a narrow width of about 400px and a wide width of about 1440px. Set light or dark mode in Settings → General → Appearance.
4. Name the files so that each pair is clear: `before-<area>-<mode>-<width>.png`.
5. Compare the console before and after. Report only the errors that your change added.

For a GIF, keep it to 2–5 seconds, crop it to the affected area, and keep it at about 800px wide and 12 fps. To convert a screen recording without color banding:

```sh
ffmpeg -i recording.mov \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" \
  -loop 0 motion.gif
```

### Putting the images in the PR

Use [`gh pr-assets`](https://github.com/PostHog/gh-pr-assets). It uploads a file and prints markdown for the PR body:

```sh
gh extension install PostHog/gh-pr-assets --pin v1.0.0
gh pr-assets image --alt "inbox after, dark, wide" after-inbox-dark-wide.png >> body.md
gh pr edit <pr> --body-file body.md
```

Uploads go to a **public** repository and are **permanent**. Hush shows real GitHub notifications, so a screenshot can show private repository names, PR titles, and people. Before you upload:

- Use a sandbox account or public repositories, or crop out private data.
- Show the user the exact files and get approval. Only then add `--yes`. Never put `--yes` in a script.

Do not commit screenshots to this repository, and do not use SVG (GitHub does not show it inline). Use a GIF, not a video: GitHub shows an uploaded video only as a link.
