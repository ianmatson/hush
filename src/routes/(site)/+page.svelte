<script lang="ts">
	import { GITHUB_MARK } from '$lib/components/site/github-mark';
	import '@fontsource-variable/newsreader/opsz-italic.css';
	import Layers from '@lucide/svelte/icons/layers';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import Timer from '@lucide/svelte/icons/timer';
	import Moon from '@lucide/svelte/icons/moon';
	import Check from '@lucide/svelte/icons/check';
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import HeroDemo from '$lib/components/site/landing/hero-demo.svelte';
	import QueryStage from '$lib/components/site/landing/query-stage.svelte';
	import GroupGallery from '$lib/components/site/landing/group-gallery.svelte';
	import QuietPhone from '$lib/components/site/landing/quiet-phone.svelte';
	import RuleStage from '$lib/components/site/landing/rule-stage.svelte';
	import KeysSwipe from '$lib/components/site/landing/keys-swipe.svelte';
	import PeekActions from '$lib/components/site/landing/peek-actions.svelte';
	import { PRICING_NOTE } from '$lib/pricing';
	import { APP_URL, REPO_URL } from '$lib/site';
	import { faqData, softwareData, websiteData, type FaqItem } from '$lib/structured-data';

	const SIGN_IN_URL = `${APP_URL}/login`;
	const DESCRIPTION =
		'Hush for GitHub is an open-source web app for the pull requests and issues that you work on: GitHub searches that stay live as views, grouped your way, with pushes for the facts that you choose, and a side panel to approve, comment, and merge.';

	const FACTS = [
		{ name: 'Review requested', on: true },
		{ name: 'Mentioned', on: true },
		{ name: 'Replied', on: true },
		{ name: 'Approved', on: true },
		{ name: 'Changes requested', on: true },
		{ name: 'CI failed', on: true },
		{ name: 'Assigned', on: true },
		{ name: 'CI passed', on: false },
		{ name: 'New in a view', on: false }
	];

	const CALM = [
		{
			icon: Layers,
			title: 'One push for each item',
			text: 'An item pushes once, then waits until you open it.'
		},
		{
			icon: AlarmClock,
			title: 'Snooze until it happens',
			text: 'Snooze until CI passes or a review comes in. Hush pushes when it does.'
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
			answerHtml: `Hush is a web app for the pull requests and issues that you work on. Each <a href="/docs/views">view</a> is a GitHub search that stays live, grouped your way. Hush shows whose turn it is on each item, pushes only the facts that you choose, and lets you read, approve, comment, and merge in a side panel.`
		},
		{
			question: 'Is it free?',
			answerHtml: `${PRICING_NOTE} See <a href="/pricing">pricing</a> for the plans that come after the beta.`
		},
		{
			question: 'What access does it need?',
			answerHtml: `You sign in with GitHub. Hush asks for the <code>notifications</code>, <code>repo</code>, <code>read:org</code>, and <code>project</code> scopes, because GitHub’s Notifications API accepts only classic scopes. Hush stores the token encrypted, and it acts on GitHub only when you do. See <a href="/docs/github-access">GitHub access</a> and <a href="/security">security</a>.`
		},
		{
			question: 'Does it change my GitHub notifications?',
			answerHtml: `No. Hush reads your notifications only to see what changed, and it never marks them read or done. Snooze, mute, and unread stay in Hush. See <a href="/docs/views#views-and-github-notifications">views and GitHub notifications</a>.`
		},
		{
			question: 'Does my org need to approve it?',
			answerHtml: `Only if your org allows just the OAuth apps that an owner approved. Until an owner approves Hush, GitHub hides that org from it. Choose <b>Request approval</b> after you sign in, or, until then, give Hush a custom token, such as the one from <code>gh auth token</code>. See <a href="/docs/github-access#when-an-org-is-missing">when an org is missing</a>.`
		},
		{
			question: 'Does it work on my phone?',
			answerHtml: `Yes. Hush is a web app that you can install, with push alerts on each device where you turn them on. On iPhone and iPad, push works only after you add Hush to the Home Screen (iOS 16.4 or later): <b>Share</b>, then <b>Add to Home Screen</b>. See <a href="/docs/notifications">notifications</a>.`
		},
		{
			question: 'Is it open source? Can I host it myself?',
			answerHtml: `Yes. All of Hush, the app, the server, and this site, is open source under AGPL‑3.0, at <a href="${REPO_URL}" rel="noreferrer">github.com/ianmatson/hush</a>. You can run your own copy on your own Cloudflare account; the README tells you how.`
		},
		{
			question: 'How is it different from GitHub’s own inbox?',
			answerHtml: `GitHub’s inbox lists notifications by time. Hush starts from your work instead: searches that you choose, grouped by your role, status, a project board, or your own sections, with whose turn it is on each item. It pushes only the facts that you turn on. Use both: Hush never changes GitHub’s inbox. See <a href="/compare/github-notifications">Hush vs. GitHub notifications</a> and <a href="/compare">other tools</a>.`
		}
	];
</script>

<SiteMeta
	title="Hush for GitHub · Views of your PRs and issues, with pushes for what changed"
	description={DESCRIPTION}
	path="/"
	structuredData={[websiteData(), softwareData(), faqData(FAQ)]}
/>

<div class="page">
	<section class="hero" aria-labelledby="hero-title">
		<div class="wrap hero-copy">
			<h1 id="hero-title">Your GitHub work, <em>in views you define.</em></h1>
			<p class="lede">
				Hush keeps your GitHub searches live as views. It groups them by your role, status, project,
				or your own sections, and pushes only the facts that you choose: a review request, failing
				CI, a reply.
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

	<section class="band tint" aria-labelledby="query-title">
		<div class="wrap split">
			<div class="intro">
				<h2 id="query-title">A view is a search <em>that stays live.</em></h2>
				<p>
					Write a search with GitHub’s words, such as <code>review-requested:@me</code>, and add
					Hush’s own: <code>size:&lt;100</code>, <code>-author:bots</code>, or a category. GitHub
					runs its part, and Hush checks the rest.
				</p>
				<p>
					The view stays current. When GitHub sends a notification about an item, Hush reads it
					again. Write <code>@today-14d</code> and the date moves with you.
				</p>
				<a class="link" href="/docs/query-language"
					>The query language <span aria-hidden="true">→</span></a
				>
			</div>
			<QueryStage />
		</div>
	</section>

	<section class="band" aria-labelledby="group-title">
		<div class="wrap">
			<div class="intro center">
				<h2 id="group-title">Group it <em>your way.</em></h2>
				<p>
					Each view puts its list into sections: by your role, by where the review stands, by the
					columns of a project board, by a category, or by sections that you write yourself. Each
					row says whose turn it is, and work that waits too long turns amber.
				</p>
				<a class="link" href="/docs/pull-requests-and-issues#group-by"
					>How Group by works <span aria-hidden="true">→</span></a
				>
			</div>
			<GroupGallery />
		</div>
	</section>

	<section class="band tint" aria-labelledby="calm-title">
		<div class="wrap">
			<div class="calm">
				<div class="calm-phone">
					<QuietPhone />
				</div>
				<div class="calm-copy">
					<h3 id="calm-title">A push for the facts <em>that you choose.</em></h3>
					<p class="sub">
						Turn on the facts that matter to you. A view can push its new items too. Everything else
						stays quiet.
					</p>
					<ul class="facts" aria-label="Facts that can push">
						{#each FACTS as fact (fact.name)}
							<li class:on={fact.on}>
								{#if fact.on}<Check size={12} aria-hidden="true" />{/if}
								{fact.name}
								<span class="sr-only">{fact.on ? '(on)' : '(off)'}</span>
							</li>
						{/each}
					</ul>
					<ul class="calm-list">
						{#each CALM as item (item.title)}
							<li>
								<item.icon size={18} aria-hidden="true" />
								<span><b>{item.title}.</b> {item.text}</span>
							</li>
						{/each}
					</ul>
					<a class="link" href="/docs/notifications#what-gets-pushed"
						>What gets pushed <span aria-hidden="true">→</span></a
					>
				</div>
			</div>
		</div>
	</section>

	<section class="band" aria-labelledby="act-title">
		<div class="wrap split reverse">
			<PeekActions />
			<div class="intro">
				<h2 id="act-title">Approve, reply, merge. <em>Without leaving.</em></h2>
				<p>
					Press <kbd>Space</kbd> to peek at a pull request or issue: the checks, the reviews, the files,
					and the conversation. Approve, request changes, comment with @mentions, # links, and :emoji,
					or merge. Your draft waits if you close it.
				</p>
				<p>
					Not now? <kbd>S</kbd> snoozes until there is new activity, <kbd>M</kbd> mutes, and
					<kbd>U</kbd> marks it unread. They stay in Hush.
				</p>
				<p class="note">Hush writes to GitHub only when you do.</p>
				<a class="link" href="/docs/peek"
					>The peek, step by step <span aria-hidden="true">→</span></a
				>
			</div>
		</div>
	</section>

	<section class="config tint" aria-labelledby="config-title">
		<div class="wrap">
			<div class="split">
				<div class="intro">
					<h2 id="config-title">Categories, <em>by rule or by Jev.</em></h2>
					<p>
						Give each item an effort and an impact, or any group of categories that you make. A
						category takes a one-line rule, such as <code>author:dependabot*</code>, or a few words
						that Jev, a decision model, reads to place your PRs and issues. Group a view by a
						category, or use <code>category:</code> in a search.
					</p>
					<a class="link" href="/docs/categories"
						>How categories work <span aria-hidden="true">→</span></a
					>
				</div>
				<RuleStage />
			</div>

			<div class="duo">
				<div class="intro">
					<h3>Shape every part.</h3>
					<p>
						Every command has a key that you can change, and every menu and swipe is yours to order.
						Views, categories, keys, and pushes all live in one <code>settings.json</code> that you can
						edit, export, or hand to an agent.
					</p>
					<a class="link" href="/docs/settings">settings.json <span aria-hidden="true">→</span></a>
				</div>
				<figure>
					<KeysSwipe />
					<figcaption>
						<b>Your keys, your swipes.</b> On a phone, swipe a row to snooze it.
					</figcaption>
				</figure>
			</div>
		</div>
	</section>

	<section class="open" aria-labelledby="open-title">
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

	<section class="faq tint" aria-labelledby="faq-title">
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

	<section class="final" aria-labelledby="final-title">
		<div class="wrap center">
			<h2 id="final-title">Start with one view. <em>Make it yours.</em></h2>
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
	.calm-list {
		display: grid;
		gap: 1.1rem;
		margin-top: 0.75rem;
	}
	.calm-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.875rem;
		font-size: 0.9875rem;
		line-height: 1.55;
		color: var(--muted-foreground);
	}
	.calm-list li :global(svg) {
		margin-top: 0.15rem;
		color: var(--signal-review);
	}
	.calm-list li b {
		font-weight: 550;
		color: var(--foreground);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.25rem;
	}
	.facts li {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		border: 1px dashed color-mix(in oklab, var(--foreground) 18%, transparent);
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}
	.facts li.on {
		border-style: solid;
		border-color: color-mix(in oklab, var(--signal-review) 35%, transparent);
		background: color-mix(in oklab, var(--signal-review) 10%, transparent);
		color: var(--foreground);
	}
	.facts li.on :global(svg) {
		color: var(--signal-review);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.calm h3 em {
		font-size: 1.06em;
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
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: center;
		gap: clamp(2rem, 5vw, 4rem);
		margin-top: clamp(4rem, 8vw, 6rem);
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
