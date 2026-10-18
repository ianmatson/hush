<script lang="ts">
	import type { Snippet } from 'svelte';
	import SiteMeta from './site-meta.svelte';
	import { SITE_NAME } from '$lib/site';
	import { articleData } from '$lib/structured-data';
	import { collectionHome, pagesOf, type SiteCollection } from '$lib/site-pages';

	let {
		collection,
		section,
		type,
		ogType,
		cardsLabel,
		cardsTitle,
		wideCards = false,
		children
	}: {
		collection: SiteCollection;
		section: string;
		type: 'Article' | 'TechArticle';
		ogType?: 'website' | 'article';
		cardsLabel: string;
		cardsTitle?: string;
		wideCards?: boolean;
		children: Snippet;
	} = $props();
	const home = $derived(collectionHome(collection)!);
	const pages = $derived(pagesOf(collection).filter((p) => p.path !== home.path));
</script>

<SiteMeta
	title="{home.title} · {SITE_NAME}"
	description={home.description}
	path={home.path}
	{ogType}
	markdownPath={home.markdownPath}
	structuredData={articleData({
		type,
		title: home.title,
		description: home.description,
		path: home.path,
		crumbs: [
			{ name: SITE_NAME, path: '/' },
			{ name: section, path: home.path }
		]
	})}
/>

<div class="collection">
	<h1>{home.title}</h1>
	<p class="lead">{home.description}</p>

	{@render children()}

	<nav aria-label={cardsLabel} class:titled={!!cardsTitle} class:wide={wideCards}>
		{#if cardsTitle}<h2>{cardsTitle}</h2>{/if}
		<ul class="cards">
			{#each pages as page (page.path)}
				<li>
					<a href={page.path}>
						<span class="name">{page.title}</span>
						<span class="description">{page.description}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>

<style>
	.collection {
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
	nav {
		margin-top: 2.5rem;
	}
	nav.titled {
		margin-top: 3.5rem;
	}
	h2 {
		font-size: 1.375rem;
		line-height: 1.3;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.75rem;
	}
	h2 + .cards {
		margin-top: 1rem;
	}
	.wide .cards {
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
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
	}
	.wide .name {
		line-height: 1.35;
	}
	.description {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--muted-foreground);
	}
</style>
