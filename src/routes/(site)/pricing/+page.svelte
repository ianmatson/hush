<script lang="ts">
	import '@fontsource-variable/newsreader/opsz-italic.css';
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import SiteHeader from '$lib/components/site/site-header.svelte';
	import SiteFooter from '$lib/components/site/site-footer.svelte';
	import { aboutBySlug } from '$lib/about';
	import { INCLUDED, PLANS, PRICING_NOTE } from '$lib/pricing';
	import { APP_URL, REPO_URL } from '$lib/site';

	// The plans are placeholders (lib/pricing.ts): nothing can be bought yet.
	const about = aboutBySlug('pricing')!;
	const monthly = PLANS.find((p) => p.per === 'month')!;
</script>

<SiteMeta title="Pricing · Hush" description={about.description} path="/pricing" />

<div class="page">
	<SiteHeader />
	<main>
		<section class="head">
			<p class="beta">{PRICING_NOTE}</p>
			<h1>One price, <em>all</em> of Hush.</h1>
			<p class="lead">
				No tiers and no seats. The price pays for your share of the servers, card fees, and the
				upkeep of Hush, so it can keep running quietly for years.
			</p>
		</section>

		<section class="plans" aria-label="Plans">
			{#each PLANS as p (p.id)}
				<article class:best={p.per === 'year'}>
					<header>
						<h2>{p.name}</h2>
						{#if p.per === 'year'}<span class="tag"
								>Save ${monthly.price * 12 - p.price} a year</span
							>{/if}
					</header>
					<p class="price"><span>${p.price}</span> a {p.per}</p>
					<p class="note">{p.note}</p>
					<ul>
						{#each INCLUDED as x (x)}
							<li>{x}</li>
						{/each}
					</ul>
					<span class="soon" aria-disabled="true">Coming soon</span>
				</article>
			{/each}
		</section>

		<p class="now">
			<a class="open" href="{APP_URL}/turn">Open Hush, free during the beta</a>
		</p>

		<section class="faq">
			<h2>Questions</h2>
			<dl>
				<div>
					<dt>Why does Hush cost money?</dt>
					<dd>
						Hush checks GitHub for you every few minutes, all day, and keeps your lists on its
						servers. That costs a little for each person. Hush has no ads and does not sell data, so
						the price is the only thing that pays for it.
					</dd>
				</div>
				<div>
					<dt>What is free now?</dt>
					<dd>Everything. Hush is free while it is in beta, and paid plans are not open yet.</dd>
				</div>
				<div>
					<dt>Can I run Hush myself?</dt>
					<dd>
						Yes. Hush is <a href={REPO_URL} rel="noreferrer">open source</a>, and it runs on a free
						Cloudflare account. The README says how to set it up.
					</dd>
				</div>
				<div>
					<dt>What happens to my data if I stop?</dt>
					<dd>
						<b>Delete account</b> in Settings deletes all of it at once. See
						<a href="/privacy">Privacy</a>.
					</dd>
				</div>
			</dl>
		</section>
	</main>
	<SiteFooter />
</div>

<style>
	.page {
		--serif: 'Newsreader Variable', Georgia, serif;
		--width: 68rem;
		min-height: 100dvh;
	}
	main {
		max-width: var(--width);
		margin: 0 auto;
		padding: clamp(2.5rem, 7vw, 5rem) 1.5rem 6rem;
	}

	.head {
		display: grid;
		justify-items: center;
		gap: 1.25rem;
		text-align: center;
	}
	.beta {
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
	}
	h1 {
		max-width: 14em;
		font-size: clamp(2.25rem, 5.4vw, 3.75rem);
		line-height: 1.04;
		font-weight: 550;
		letter-spacing: -0.04em;
		text-wrap: balance;
	}
	em {
		font-family: var(--serif);
		font-style: italic;
		font-weight: 400;
		font-size: 1.08em;
		letter-spacing: -0.02em;
	}
	.lead {
		max-width: 34rem;
		font-size: 1.125rem;
		line-height: 1.6;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}

	.plans {
		display: grid;
		gap: 1.25rem;
		max-width: 48rem;
		margin: 3.5rem auto 0;
	}
	@media (min-width: 44rem) {
		.plans {
			grid-template-columns: 1fr 1fr;
		}
	}
	article {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		padding: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
	}
	article.best {
		border-color: color-mix(in oklab, var(--foreground) 35%, var(--border));
		box-shadow:
			0 1px 0 var(--border),
			0 12px 40px -24px color-mix(in oklab, var(--foreground) 40%, transparent);
	}
	article header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	h2 {
		font-size: 1rem;
		font-weight: 600;
	}
	.tag {
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		background: var(--muted);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.price {
		color: var(--muted-foreground);
	}
	.price span {
		font-size: 2.75rem;
		font-weight: 600;
		letter-spacing: -0.04em;
		color: var(--foreground);
	}
	.note {
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}
	ul {
		display: grid;
		gap: 0.5rem;
		margin: 0.5rem 0 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
	}
	li {
		position: relative;
		padding-left: 1.5rem;
	}
	li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--muted-foreground);
	}
	.soon {
		display: block;
		padding: 0.625rem;
		border: 1px dashed var(--border);
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 500;
		text-align: center;
		color: var(--muted-foreground);
	}

	.now {
		margin-top: 2.5rem;
		text-align: center;
	}
	.open {
		display: inline-block;
		padding: 0.625rem 1rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.9375rem;
		font-weight: 500;
		transition: opacity 0.2s;
	}
	.open:hover {
		opacity: 0.85;
	}

	.faq {
		max-width: 44rem;
		margin: 6rem auto 0;
	}
	.faq h2 {
		font-size: 1.375rem;
		letter-spacing: -0.02em;
	}
	dl {
		display: grid;
		margin-top: 1rem;
	}
	dl div {
		padding: 1.25rem 0;
		border-top: 1px solid var(--border);
	}
	dt {
		font-weight: 550;
	}
	dd {
		margin-top: 0.375rem;
		line-height: 1.65;
		color: var(--muted-foreground);
	}
	dd a {
		color: var(--foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	dd b {
		font-weight: 550;
		color: var(--foreground);
	}
</style>
