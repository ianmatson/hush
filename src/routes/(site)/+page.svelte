<script lang="ts">
	import '@fontsource-variable/newsreader/opsz-italic.css';
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import HushWave from '$lib/components/site/landing/hush-wave.svelte';
	import TurnLanes from '$lib/components/site/landing/turn-lanes.svelte';
	import DayDial from '$lib/components/site/landing/day-dial.svelte';
	import RuleTyper from '$lib/components/site/landing/rule-typer.svelte';
	import { APP_URL } from '$lib/site';

	const REPO = 'https://github.com/ianmatson/hush';
</script>

<SiteMeta
	title="Hush · GitHub notifications that only show what needs you"
	description="Hush sorts your GitHub notifications into what needs you and what is only FYI, shows whose turn it is on every pull request, and pushes only what waits on you."
	path="/"
/>

<div class="page">
	<header class="nav">
		<a href="/" class="brand"><img src="/icon.svg" alt="" />hush</a>
		<nav>
			<a href="/docs">Docs</a>
			<a href={REPO} rel="noreferrer">Source</a>
			<a href="{APP_URL}/login">Sign in</a>
			<a class="open" href="{APP_URL}/inbox">Open Hush</a>
		</nav>
	</header>

	<main>
		<section class="hero">
			<h1 class="in" style:--d="0">
				GitHub sends you everything. Hush keeps <em>quiet</em> about most of it.
			</h1>
			<p class="lede in" style:--d="1">
				It sorts your notifications into what needs you and what is only FYI, follows whose turn it
				is on every pull request, and sends a push only when something waits on you.
			</p>
			<p class="links in" style:--d="2">
				<a class="open big" href="{APP_URL}/inbox">Open Hush</a>
				<a class="quiet" href={REPO} rel="noreferrer">Read the source <span>→</span></a>
			</p>
			<div class="in" style:--d="3">
				<HushWave />
			</div>
		</section>

		<section class="specimens">
			<article class="reveal">
				<TurnLanes />
				<p>
					<b>Whose turn it is.</b> Hush follows each pull request as it moves between you and your team,
					and puts your turn on top. Work that waits too long turns amber.
				</p>
			</article>
			<article class="reveal">
				<DayDial />
				<p>
					<b>A push only when it matters.</b> What needs you buzzes; FYI stays silent. At night, quiet
					hours hold everything, and one push brings it in the morning.
				</p>
			</article>
			<article class="reveal">
				<RuleTyper />
				<p>
					<b>Rules in one line.</b> One short syntax filters the inbox, saves views, and writes rules
					that clean up by themselves.
				</p>
			</article>
		</section>

		<section class="close reveal">
			<p>
				Hush acts on GitHub only when you do: <em>approve</em>, <em>comment</em>,
				<em>merge</em>, or mark it <em>Done</em>, without leaving your inbox. It is open source, and
				it takes a minute to set up.
			</p>
			<a class="quiet" href="{APP_URL}/inbox">Open Hush <span>→</span></a>
		</section>
	</main>

	<footer class="foot">
		<span class="brand small"><img src="/icon.svg" alt="" />hush</span>
		<nav>
			<a href="/docs">Docs</a>
			<a href={REPO} rel="noreferrer">Source</a>
			<a href="{APP_URL}/login">Sign in</a>
		</nav>
	</footer>
</div>

<style>
	.page {
		--ease: cubic-bezier(0.2, 0.8, 0.2, 1);
		--serif: 'Newsreader Variable', Georgia, serif;
		--width: 68rem;
		min-height: 100dvh;
		overflow-x: clip;
	}
	a {
		transition: color 0.2s;
	}

	.nav,
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: var(--width);
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
	}
	.nav nav,
	.foot nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		font-size: 0.875rem;
	}
	.nav nav a:not(.open),
	.foot nav a {
		color: var(--muted-foreground);
	}
	.nav nav a:not(.open):hover,
	.foot nav a:hover {
		color: var(--foreground);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.brand img {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.4375rem;
	}
	.brand.small {
		font-size: 0.875rem;
	}
	.brand.small img {
		width: 1.125rem;
		height: 1.125rem;
	}
	.open {
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
		transition: opacity 0.2s;
	}
	.open:hover {
		opacity: 0.85;
	}
	.open.big {
		padding: 0.625rem 1rem;
		font-size: 0.9375rem;
	}
	.quiet {
		font-size: 0.9375rem;
		color: var(--muted-foreground);
	}
	.quiet span {
		display: inline-block;
		transition: translate 0.25s var(--ease);
	}
	.quiet:hover {
		color: var(--foreground);
	}
	.quiet:hover span {
		translate: 0.2rem 0;
	}
	em {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 400;
		letter-spacing: -0.01em;
	}

	main {
		max-width: var(--width);
		margin: 0 auto;
		padding: 0 1.5rem;
	}
	.hero {
		display: grid;
		gap: 1.75rem;
		padding: clamp(3rem, 9vw, 7.5rem) 0 clamp(3rem, 7vw, 5rem);
	}
	h1 {
		max-width: 15em;
		font-size: clamp(2.25rem, 5.4vw, 4.25rem);
		line-height: 1.02;
		font-weight: 550;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}
	h1 em {
		font-size: 1.08em;
		letter-spacing: -0.02em;
	}
	.lede {
		max-width: 34rem;
		font-size: 1.125rem;
		line-height: 1.6;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: clamp(1.5rem, 5vw, 3.5rem);
	}
	.in {
		animation: rise 1s var(--ease) both;
		animation-delay: calc(var(--d) * 110ms + 80ms);
	}

	.specimens {
		display: grid;
		gap: 3.5rem;
		padding: 4rem 0 6rem;
		border-top: 1px solid var(--border);
	}
	@media (min-width: 60rem) {
		.specimens {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2.5rem;
		}
	}
	.specimens article {
		display: grid;
		align-content: start;
		gap: 1.25rem;
	}
	.specimens p {
		font-size: 0.9875rem;
		line-height: 1.6;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.specimens b {
		font-weight: 550;
		color: var(--foreground);
	}

	.close {
		display: grid;
		justify-items: start;
		gap: 1.5rem;
		padding: 5rem 0 7rem;
		border-top: 1px solid var(--border);
	}
	.close p {
		max-width: 30em;
		font-size: clamp(1.375rem, 2.6vw, 1.875rem);
		line-height: 1.35;
		letter-spacing: -0.02em;
		text-wrap: pretty;
	}
	.close em {
		font-size: 1.06em;
	}
	/* The line spans the content only, like the lines above it. */
	.foot {
		position: relative;
		padding-top: 1.75rem;
		padding-bottom: 2.5rem;
	}
	.foot::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1.5rem;
		right: 1.5rem;
		border-top: 1px solid var(--border);
	}

	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 1rem;
			filter: blur(6px);
		}
		to {
			opacity: 1;
			translate: 0 0;
			filter: blur(0);
		}
	}
	/* Blocks rise into view as you scroll (where the browser supports scroll timelines). */
	@supports (animation-timeline: view()) {
		.reveal {
			animation: rise linear both;
			animation-timeline: view();
			animation-range: entry 0% cover 25%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.in,
		.reveal {
			animation: none;
		}
	}
</style>
