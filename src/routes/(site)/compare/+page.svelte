<script lang="ts">
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import MarkdownBody from '$lib/components/site/markdown-body.svelte';
	import { comparePath } from '$lib/compare';
	import { COMPARE, COMPARE_INDEX } from '$lib/compare/content';
	import { renderMarkdown } from '$lib/docs';
	import { SITE_NAME } from '$lib/site';
	import { articleData } from '$lib/structured-data';

	const rendered = renderMarkdown(COMPARE_INDEX.markdown);
</script>

<SiteMeta
	title="{COMPARE_INDEX.title} · {SITE_NAME}"
	description={COMPARE_INDEX.description}
	path={COMPARE_INDEX.path}
	ogType="article"
	structuredData={articleData({
		type: 'Article',
		title: COMPARE_INDEX.title,
		description: COMPARE_INDEX.description,
		path: COMPARE_INDEX.path,
		crumbs: [
			{ name: SITE_NAME, path: '/' },
			{ name: 'Compare', path: COMPARE_INDEX.path }
		]
	})}
/>

<div class="compare">
	<h1>{COMPARE_INDEX.title}</h1>
	<p class="lead">{COMPARE_INDEX.description}</p>

	<MarkdownBody html={rendered.html} />

	<nav aria-label="Comparisons">
		<h2>Every comparison</h2>
		<ul class="cards">
			{#each COMPARE as page (page.slug)}
				<li>
					<a href={comparePath(page)}>
						<span class="name">{page.title}</span>
						<span class="description">{page.description}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>

<style>
	.compare {
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
		margin-top: 1rem;
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
	.description {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--muted-foreground);
	}
</style>
