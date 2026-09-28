<script lang="ts">
	import '@fontsource-variable/newsreader/opsz-italic.css';
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import HushWave from '$lib/components/site/landing/hush-wave.svelte';
	import TurnLanes from '$lib/components/site/landing/turn-lanes.svelte';
	import DayDial from '$lib/components/site/landing/day-dial.svelte';
	import RuleTyper from '$lib/components/site/landing/rule-typer.svelte';
	import SiteHeader from '$lib/components/site/site-header.svelte';
	import SiteFooter from '$lib/components/site/site-footer.svelte';
	import { PLANS } from '$lib/pricing';
	import { APP_URL, REPO_URL } from '$lib/site';

	const price = PLANS.map((p) => `$${p.price} a ${p.per}`).join(' or ');
	/** The pages for the questions people ask before they sign in. */
	const ANSWERS = [
		{
			href: '/privacy',
			title: 'Privacy',
			text: 'What Hush stores, who sees it, and how to delete all of it.'
		},
		{
			href: '/security',
			title: 'Security',
			text: 'What Hush can do with your GitHub access, for you and your org’s owners.'
		},
		{ href: '/pricing', title: 'Pricing', text: `Free during the beta. Later, ${price}.` },
		{ href: '/docs', title: 'Docs', text: 'Every lane, rule, key, and setting, explained.' }
	];
</script>

<SiteMeta
	title="Hush · What is your turn on GitHub, and nothing else"
	description="Hush reads your GitHub notifications and tells you whose turn it is: what waits on you, what waits on others, and the rest as a quiet feed. It pushes only when something becomes your turn."
	path="/"
/>

<div class="page">
	<SiteHeader />

	<main>
		<section class="hero">
			<h1 class="in" style:--d="0">
				GitHub sends you everything. Hush keeps <em>quiet</em> about most of it.
			</h1>
			<p class="lede in" style:--d="1">
				It follows whose turn it is on every pull request and issue that involves you, shows what
				waits on you first, and sends a push only when something becomes your turn.
			</p>
			<p class="links in" style:--d="2">
				<a class="open big" href="{APP_URL}/turn">Open Hush</a>
				<a class="quiet" href={REPO_URL} rel="noreferrer">Read the source <span>→</span></a>
			</p>
			<div class="in" style:--d="3">
				<HushWave />
			</div>
		</section>

		<section class="specimens">
			<article class="reveal">
				<TurnLanes />
				<p>
					<b>Whose turn it is.</b> Hush follows each pull request as it moves between you and others:
					Your turn, Waiting, or a quiet update. When you approve, it moves on by itself.
				</p>
			</article>
			<article class="reveal">
				<DayDial />
				<p>
					<b>A push only when it matters.</b> What becomes your turn buzzes; updates stay silent. At night,
					quiet hours hold everything, and one push brings it in the morning.
				</p>
			</article>
			<article class="reveal">
				<RuleTyper />
				<p>
					<b>Wrong? Say so once.</b> “Not my turn” asks why, and fixes the cause. For the rest, one short
					syntax searches everything and writes rules.
				</p>
			</article>
		</section>

		<section class="answers reveal" aria-labelledby="answers">
			<h2 id="answers">Before you sign in</h2>
			<ul>
				{#each ANSWERS as a (a.href)}
					<li>
						<a href={a.href}>
							<b>{a.title} <span>→</span></b>
							{a.text}
						</a>
					</li>
				{/each}
			</ul>
		</section>

		<section class="close reveal">
			<p>
				Hush acts on GitHub only when you do: <em>approve</em>, <em>comment</em>,
				<em>merge</em>, or mark it <em>Done</em>, without leaving Hush. It is open source, and it
				takes a minute to set up.
			</p>
			<a class="quiet" href="{APP_URL}/turn">Open Hush <span>→</span></a>
		</section>
	</main>

	<SiteFooter />
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

	.answers {
		display: grid;
		gap: 1.5rem;
		padding: 4rem 0 5rem;
		border-top: 1px solid var(--border);
	}
	.answers h2 {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}
	.answers ul {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 40rem) {
		.answers ul {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 60rem) {
		.answers ul {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.answers a {
		display: grid;
		gap: 0.375rem;
		height: 100%;
		padding: 1.125rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 0.875rem;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--muted-foreground);
		transition:
			border-color 0.2s,
			background 0.2s;
	}
	.answers a:hover {
		border-color: color-mix(in oklab, var(--foreground) 30%, var(--border));
		background: color-mix(in oklab, var(--muted) 50%, transparent);
	}
	.answers b {
		font-size: 1rem;
		font-weight: 550;
		color: var(--foreground);
	}
	.answers b span {
		display: inline-block;
		color: var(--muted-foreground);
		transition: translate 0.25s var(--ease);
	}
	.answers a:hover b span {
		translate: 0.2rem 0;
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
