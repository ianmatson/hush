<script lang="ts">
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import { GUIDES, GUIDES_INDEX, GUIDES_INTRO, guidePath } from '$lib/guides';
	import { SITE_NAME } from '$lib/site';
	import { articleData } from '$lib/structured-data';
</script>

<SiteMeta
	title="{GUIDES_INDEX.title} · {SITE_NAME}"
	description={GUIDES_INDEX.description}
	path={GUIDES_INDEX.path}
	structuredData={articleData({
		type: 'TechArticle',
		title: GUIDES_INDEX.title,
		description: GUIDES_INDEX.description,
		path: GUIDES_INDEX.path,
		crumbs: [
			{ name: SITE_NAME, path: '/' },
			{ name: 'Guides', path: GUIDES_INDEX.path }
		]
	})}
/>

<div class="guides">
	<h1>{GUIDES_INDEX.title}</h1>
	<p class="lead">{GUIDES_INDEX.description}</p>
	<p class="intro">{GUIDES_INTRO}</p>

	<nav aria-label="Guides">
		<ul class="cards">
			{#each GUIDES as page (page.slug)}
				<li>
					<a href={guidePath(page)}>
						<span class="name">{page.title}</span>
						<span class="description">{page.description}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>

<style>
	.guides {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vw, 4.5rem) 1.5rem 5rem;
	}
	h1 {
		font-size: clamp(2rem, 4.5vw, 2.875rem);
		line-height: 1.08;
		font-weight: 600;
		letter-spacing: -0.035em;
		text-wrap: balance;
	}
	.lead {
		margin-top: 1rem;
		max-width: 42rem;
		font-size: 1.125rem;
		line-height: 1.55;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.intro {
		margin-top: 0.75rem;
		max-width: 42rem;
		font-size: 0.9375rem;
		line-height: 1.6;
		text-wrap: pretty;
	}
	nav {
		margin-top: 2.5rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: 0.75rem;
	}
	.cards a {
		display: grid;
		align-content: start;
		gap: 0.375rem;
		height: 100%;
		padding: 1rem 1.125rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		transition: background 0.15s;
	}
	.cards a:hover {
		background: var(--muted);
	}
	.name {
		font-weight: 550;
		line-height: 1.35;
	}
	.description {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--muted-foreground);
	}
</style>
