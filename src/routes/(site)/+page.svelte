<script module lang="ts">
	const GITHUB_MARK =
		'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';
</script>

<script lang="ts">
	import '@fontsource-variable/newsreader/opsz-italic.css';
	import Layers from '@lucide/svelte/icons/layers';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Timer from '@lucide/svelte/icons/timer';
	import Moon from '@lucide/svelte/icons/moon';
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import HeroDemo from '$lib/components/site/landing/hero-demo.svelte';
	import NoiseSort from '$lib/components/site/landing/noise-sort.svelte';
	import QuietPhone from '$lib/components/site/landing/quiet-phone.svelte';
	import RuleStage from '$lib/components/site/landing/rule-stage.svelte';
	import DashTurns from '$lib/components/site/landing/dash-turns.svelte';
	import KeysSwipe from '$lib/components/site/landing/keys-swipe.svelte';
	import PeekActions from '$lib/components/site/landing/peek-actions.svelte';
	import { PRICING_NOTE } from '$lib/pricing';
	import { APP_URL, REPO_URL } from '$lib/site';
	import { faqData, softwareData, websiteData, type FaqItem } from '$lib/structured-data';

	const SIGN_IN_URL = `${APP_URL}/login`;
	const DESCRIPTION =
		'Hush for GitHub is an open-source web app that keeps the clutter out of your GitHub notifications: a short Needs you list sorted by whose turn it is, categories and views that you control, and approve, comment, and merge from the inbox.';

	const CALM = [
		{
			icon: Layers,
			title: 'One alert for each PR',
			text: 'A review request, a CI failure, and a reply on the same PR share one alert.'
		},
		{
			icon: BellOff,
			title: 'No repeats until you look',
			text: 'An item pushes once, then waits until you open Hush or act on it.'
		},
		{
			icon: Timer,
			title: 'Digests and limits',
			text: 'Collect pushes into one every 5 to 240 minutes, or cap how many can come in a set time.'
		},
		{
			icon: Moon,
			title: 'Quiet hours',
			text: 'Nights and weekends stay silent. One push in the morning lists what waited.'
		}
	];

	const FAQ: FaqItem[] = [
		{
			question: 'What is Hush for GitHub?',
			answerHtml: `Hush is a web app for your GitHub notifications. It reads the pull request or issue behind each one, decides whose turn it is, and keeps a short <b>Needs you</b> list. You can read, approve, comment, and merge from it, and get a push only for what waits on you.`
		},
		{
			question: 'Is it free?',
			answerHtml: `${PRICING_NOTE} See <a href="/pricing">pricing</a> for the plans that come after the beta.`
		},
		{
			question: 'What access does it need?',
			answerHtml: `You sign in with GitHub. Hush asks for the <code>notifications</code>, <code>repo</code>, and <code>read:org</code> scopes, because GitHub’s Notifications API accepts only these classic scopes. Hush stores the token encrypted, and it acts on GitHub only when you do. See <a href="/docs/github-access">GitHub access</a> and <a href="/security">security</a>.`
		},
		{
			question: 'Does my org need to approve it?',
			answerHtml: `Only if your org allows just the OAuth apps that an owner approved. Until an owner approves Hush, GitHub hides that org from it. Choose <b>Request approval</b> after you sign in, or, until then, give Hush a custom token, such as the one from <code>gh auth token</code>. See <a href="/docs/github-access#when-an-org-is-missing">when an org is missing</a>.`
		},
		{
			question: 'Does it work on my phone?',
			answerHtml: `Yes. Hush is a web app that you can install, with push alerts on each device where you turn them on. On iPhone and iPad, push works only after you add Hush to the Home Screen (iOS 16.4 or later): Share, then <b>Add to Home Screen</b>. See <a href="/docs/notifications">notifications</a>.`
		},
		{
			question: 'Is it open source? Can I host it myself?',
			answerHtml: `Yes. All of Hush, the app, the server, and this site, is open source under AGPL‑3.0, at <a href="${REPO_URL}" rel="noreferrer">github.com/ianmatson/hush</a>. You can run your own copy on your own Cloudflare account; the README tells you how.`
		},
		{
			question: 'How is it different from GitHub’s own inbox?',
			answerHtml: `GitHub lists every notification by time. Hush sorts them by who must act next, pushes only what needs you, and lets you act from a side panel. You can use both: Hush marks threads read and done on GitHub too. See <a href="/compare/github-notifications">Hush vs. GitHub notifications</a> and <a href="/compare">other tools</a>.`
		}
	];
</script>

<SiteMeta
	title="Hush for GitHub · Keep the clutter out of your GitHub notifications"
	description={DESCRIPTION}
	path="/"
	structuredData={[websiteData(), softwareData(), faqData(FAQ)]}
/>

<div class="page">
	<section class="hero" aria-labelledby="hero-title">
		<div class="wrap hero-copy">
			<h1 id="hero-title">See what needs you on GitHub. <em>Then get it done.</em></h1>
			<p class="lede">
				Hush for GitHub is an open-source web app that reads the pull request or issue behind each
				GitHub notification, keeps a short list of what needs you, and lets you approve, comment,
				and merge without leaving it.
			</p>
			<div class="ctas">
				<a class="button" href={SIGN_IN_URL}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d={GITHUB_MARK} /></svg>
					Sign in with GitHub
				</a>
				<a class="link" href="/docs">Read the docs <span aria-hidden="true">→</span></a>
			</div>
			<p class="fine">
				Free while in beta · <a href={REPO_URL} rel="noreferrer">Open source, AGPL‑3.0</a>
			</p>
		</div>
		<div class="wrap hero-stage">
			<HeroDemo />
		</div>
	</section>

	<section class="band tint" aria-labelledby="noise-title">
		<div class="wrap">
			<div class="intro center">
				<h2 id="noise-title">47 notifications. <em>Five need you.</em></h2>
				<p>
					Hush reads the PR or issue behind each notification, and puts it where it belongs: <b
						>Needs you</b
					>
					when you are next to act, <b>FYI</b> when you only want to know, and muted when your categories
					say so.
				</p>
			</div>
			<NoiseSort />
		</div>
	</section>

	<section class="band" aria-labelledby="calm-title">
		<div class="wrap">
			<div class="calm">
				<div class="calm-phone">
					<QuietPhone />
				</div>
				<div class="calm-copy">
					<h3 id="calm-title">A push only when it is your turn.</h3>
					<p class="sub">
						Busy PRs change all day. Hush keeps them from buzzing your phone each time.
					</p>
					<ul>
						{#each CALM as item (item.title)}
							<li>
								<item.icon size={18} aria-hidden="true" />
								<span><b>{item.title}.</b> {item.text}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	</section>

	<section class="config tint" aria-labelledby="config-title">
		<div class="wrap">
			<div class="split">
				<div class="intro">
					<h2 id="config-title">Sorted <em>your way.</em></h2>
					<p>
						Give a category a one-line rule, such as <code>author:dependabot*</code>, and send what
						it catches to <b>Muted</b>. Save any filter as its own tab. Change every key, menu, and
						swipe. All of it lives in one <code>settings.json</code> that you can edit, export, or hand
						to an agent.
					</p>
					<a class="link" href="/docs/categories"
						>How categories work <span aria-hidden="true">→</span></a
					>
				</div>
				<RuleStage />
			</div>

			<div class="duo">
				<figure class="wide-fig">
					<DashTurns />
					<figcaption>
						<b>Pull requests and issues, by whose turn it is.</b> Each section is a GitHub search that
						you choose. Work that waits too long turns amber.
					</figcaption>
				</figure>
				<figure>
					<KeysSwipe />
					<figcaption>
						<b>Your keys, your swipes.</b> Every command has a key that you can change. On a phone, swipe
						a row to finish it.
					</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="band" aria-labelledby="act-title">
		<div class="wrap split reverse">
			<PeekActions />
			<div class="intro">
				<h2 id="act-title">Approve, reply, merge. <em>From the inbox.</em></h2>
				<p>
					Press <kbd>Space</kbd> to peek at a thread: the checks, the reviews, and the conversation. Approve,
					request changes, comment with @mentions, # links, and :emoji, or merge. Your draft waits if
					you close it.
				</p>
				<p>
					Finished? <kbd>E</kbd> for Done, <kbd>S</kbd> to snooze, <kbd>M</kbd> to mute. On Chrome, Edge,
					and Android, push alerts have Done and Snooze buttons too.
				</p>
				<p class="note">Hush writes to GitHub only when you do.</p>
				<a class="link" href="/docs/peek"
					>The peek, step by step <span aria-hidden="true">→</span></a
				>
			</div>
		</div>
	</section>

	<section class="open tint" aria-labelledby="open-title">
		<div class="wrap open-grid">
			<h2 id="open-title">Open source. <em>Free while in beta.</em></h2>
			<div class="open-copy">
				<p>
					The app, the server, and this site are on GitHub under AGPL‑3.0. Read what Hush does with
					your token, or run your own copy on your own Cloudflare account. Hush has no analytics,
					and it shares nothing.
				</p>
				<p class="muted">{PRICING_NOTE}</p>
				<p class="links">
					<a class="link" href={REPO_URL} rel="noreferrer"
						>Read the source <span aria-hidden="true">→</span></a
					>
					<a class="link" href="/privacy">Privacy <span aria-hidden="true">→</span></a>
					<a class="link" href="/security">Security <span aria-hidden="true">→</span></a>
					<a class="link" href="/pricing">Pricing <span aria-hidden="true">→</span></a>
				</p>
			</div>
		</div>
	</section>

	<section class="faq" aria-labelledby="faq-title">
		<div class="wrap faq-grid">
			<h2 id="faq-title">Questions</h2>
			<div class="qs">
				{#each FAQ as item (item.question)}
					<details>
						<summary>{item.question}</summary>
						<p>{@html item.answerHtml}</p>
					</details>
				{/each}
			</div>
		</div>
	</section>

	<section class="final tint" aria-labelledby="final-title">
		<div class="wrap center">
			<h2 id="final-title">Five things need you. <em>Start there.</em></h2>
			<div class="ctas">
				<a class="button" href={SIGN_IN_URL}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d={GITHUB_MARK} /></svg>
					Sign in with GitHub
				</a>
				<a class="link" href="/docs/getting-started"
					>Getting started <span aria-hidden="true">→</span></a
				>
			</div>
		</div>
	</section>
</div>

<style>
	.page {
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		--serif: 'Newsreader Variable', Georgia, serif;
		--tint: color-mix(in oklab, var(--foreground) 3.5%, var(--background));
		overflow-x: clip;
	}
	.wrap {
		width: 100%;
		max-width: var(--width);
		margin: 0 auto;
		padding: 0 1.5rem;
	}
	.center {
		text-align: center;
	}
	em {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 400;
		letter-spacing: -0.015em;
	}
	h1 em,
	h2 em {
		font-size: 1.06em;
	}
	h2 {
		font-size: clamp(2rem, 4.6vw, 3.5rem);
		font-weight: 550;
		line-height: 1.04;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}
	code,
	kbd {
		padding: 0.05em 0.35em;
		border-radius: 0.3rem;
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.84em;
		color: var(--foreground);
	}
	code {
		white-space: nowrap;
	}
	kbd {
		border: 1px solid color-mix(in oklab, var(--foreground) 14%, transparent);
		border-bottom-width: 2px;
		background: var(--background);
	}
	a:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
		border-radius: 0.375rem;
	}
	::selection {
		background: color-mix(in oklab, var(--signal-review) 30%, transparent);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.75rem 1.2rem;
		border-radius: 0.75rem;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.9875rem;
		font-weight: 500;
		box-shadow: 0 10px 24px -14px rgb(0 0 0 / 0.6);
		transition:
			translate 0.25s var(--ease),
			box-shadow 0.25s var(--ease),
			opacity 0.2s;
	}
	.button:hover {
		translate: 0 -1px;
		box-shadow: 0 14px 28px -14px rgb(0 0 0 / 0.65);
	}
	.button:active {
		translate: 0 0;
		opacity: 0.9;
	}
	.button svg {
		width: 1.0625rem;
		height: 1.0625rem;
		fill: currentColor;
	}
	.link {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--foreground);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 25%, transparent);
		text-underline-offset: 0.3em;
		transition: text-decoration-color 0.2s;
	}
	.link span {
		display: inline-block;
		transition: translate 0.25s var(--ease);
	}
	.link:hover {
		text-decoration-color: currentColor;
	}
	.link:hover span {
		translate: 0.2rem 0;
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem 1.75rem;
	}

	.hero {
		position: relative;
		padding: clamp(2.5rem, 6vw, 5rem) 0 clamp(4.5rem, 9vw, 7rem);
	}
	.hero::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		z-index: -1;
		height: clamp(10rem, 22vw, 17rem);
		border-top: 1px solid var(--border);
		background: var(--tint);
	}
	.hero-copy {
		display: grid;
		justify-items: center;
		gap: 1.5rem;
		text-align: center;
	}
	h1 {
		max-width: 13em;
		font-size: clamp(2.5rem, 6.2vw, 4.75rem);
		font-weight: 560;
		line-height: 1;
		letter-spacing: -0.045em;
		text-wrap: balance;
	}
	h1 em {
		display: block;
	}
	.lede {
		max-width: 43rem;
		font-size: clamp(1.0625rem, 1.6vw, 1.1875rem);
		line-height: 1.55;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.hero .ctas {
		margin-top: 0.5rem;
	}
	.fine {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}
	.fine a {
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
		text-underline-offset: 0.25em;
	}
	.fine a:hover {
		color: var(--foreground);
	}
	.hero-stage {
		max-width: 86rem;
		margin-top: clamp(3rem, 6vw, 4.5rem);
	}

	.band {
		padding: clamp(5rem, 10vw, 8.5rem) 0;
	}
	.intro {
		display: grid;
		align-content: start;
		justify-items: start;
		gap: 1.25rem;
	}
	.intro.center {
		justify-items: center;
		margin: 0 auto clamp(3rem, 6vw, 4.5rem);
	}
	.intro p {
		max-width: 36rem;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.intro b {
		font-weight: 550;
		color: var(--foreground);
	}

	.calm {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: clamp(2.5rem, 7vw, 6rem);
		padding: 0 clamp(0rem, 4vw, 3rem);
	}
	.calm-copy {
		display: grid;
		gap: 1rem;
		max-width: 32rem;
	}
	h3 {
		font-size: clamp(1.5rem, 2.8vw, 2.125rem);
		font-weight: 550;
		line-height: 1.1;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}
	.sub {
		font-size: 1.0625rem;
		line-height: 1.55;
		color: var(--muted-foreground);
	}
	.calm ul {
		display: grid;
		gap: 1.1rem;
		margin-top: 0.75rem;
	}
	.calm li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.875rem;
		font-size: 0.9875rem;
		line-height: 1.55;
		color: var(--muted-foreground);
	}
	.calm li :global(svg) {
		margin-top: 0.15rem;
		color: var(--signal-review);
	}
	.calm li b {
		font-weight: 550;
		color: var(--foreground);
	}

	.config {
		padding: clamp(5.5rem, 11vw, 9rem) 0 clamp(4rem, 8vw, 6rem);
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
		align-items: center;
		gap: clamp(2.5rem, 6vw, 5rem);
	}
	.split h2 {
		font-size: clamp(2rem, 4vw, 3rem);
	}
	.split.reverse {
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
	}
	.duo {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		align-items: start;
		gap: clamp(2rem, 5vw, 4rem);
		margin-top: clamp(2rem, 4vw, 3rem);
	}
	figure {
		display: grid;
		gap: 1.25rem;
	}
	figcaption {
		max-width: 30rem;
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	figcaption b {
		font-weight: 550;
		color: var(--foreground);
	}

	.tint {
		position: relative;
		isolation: isolate;
		border-block: 1px solid var(--border);
		background: var(--tint);
	}
	.tint::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image: radial-gradient(
			circle,
			color-mix(in oklab, var(--foreground) 16%, transparent) 1px,
			transparent 1.5px
		);
		background-size: 22px 22px;
		background-position: center top;
		mask-image:
			radial-gradient(ellipse 62% 70% at 50% 50%, transparent 40%, #000 100%),
			linear-gradient(transparent, #000 18%, #000 82%, transparent);
		mask-composite: intersect;
		pointer-events: none;
	}
	.band.tint {
		border-top: none;
	}
	:global(main:has(> .page) + .foot::before) {
		display: none;
	}
	.note {
		font-weight: 500;
		color: var(--foreground) !important;
	}

	.open {
		padding: clamp(5rem, 10vw, 8rem) 0;
	}
	.open-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: clamp(2rem, 6vw, 5rem);
		align-items: start;
	}
	.open-copy {
		display: grid;
		gap: 1rem;
		padding-top: 0.5rem;
	}
	.open-copy p {
		font-size: 1.0625rem;
		line-height: 1.6;
		text-wrap: pretty;
	}
	.open-copy .muted {
		color: var(--muted-foreground);
	}
	.open-copy .links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin-top: 0.5rem;
	}

	.faq {
		padding: clamp(5rem, 10vw, 8rem) 0;
	}
	.faq-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: clamp(2rem, 6vw, 5rem);
	}
	.faq h2 {
		font-size: clamp(1.75rem, 3.4vw, 2.5rem);
	}
	.qs {
		display: grid;
	}
	details {
		border-bottom: 1px solid var(--border);
	}
	details:first-child {
		border-top: 1px solid var(--border);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.15rem 0;
		font-size: 1.0625rem;
		font-weight: 500;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '+';
		flex: none;
		font-size: 1.375rem;
		font-weight: 300;
		line-height: 1;
		color: var(--muted-foreground);
		transition: rotate 0.25s var(--ease);
	}
	details[open] summary::after {
		rotate: 45deg;
	}
	summary:hover::after {
		color: var(--foreground);
	}
	details p {
		max-width: 40rem;
		padding: 0 0 1.4rem;
		font-size: 0.9875rem;
		line-height: 1.65;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	details p :global(a) {
		color: var(--foreground);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, currentColor 30%, transparent);
		text-underline-offset: 0.25em;
	}
	details p :global(a:hover) {
		text-decoration-color: currentColor;
	}
	details p :global(b) {
		font-weight: 550;
		color: var(--foreground);
	}
	details p :global(code) {
		padding: 0.05em 0.35em;
		border-radius: 0.3rem;
		background: color-mix(in oklab, var(--foreground) 7%, transparent);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.84em;
		color: var(--foreground);
	}

	.final {
		padding: clamp(5rem, 10vw, 8rem) 0;
	}
	.final .wrap {
		display: grid;
		justify-items: center;
		gap: 2rem;
	}
	.final h2 {
		max-width: 12em;
		font-size: clamp(2.25rem, 5.6vw, 4.25rem);
	}
	.final h2 em {
		display: block;
	}

	@media (max-width: 72rem) {
		.split.reverse {
			grid-template-columns: minmax(0, 1fr);
		}
		.split.reverse > .intro {
			order: -1;
			max-width: 40rem;
		}
	}
	@media (max-width: 60rem) {
		.split,
		.duo,
		.open-grid,
		.faq-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.calm {
			grid-template-columns: minmax(0, 1fr);
			justify-items: center;
			padding: 0;
		}
	}
	@media (max-width: 40rem) {
		.calm-phone {
			zoom: 0.9;
		}
		.ctas {
			flex-direction: column;
		}
	}
</style>
