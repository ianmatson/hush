<script lang="ts">
	import SiteMeta from './site-meta.svelte';
	import MarkdownBody from './markdown-body.svelte';
	import { SITE_NAME } from '$lib/site';
	import { articleData } from '$lib/structured-data';
	import { renderMarkdown } from '$lib/docs';
	import { collectionHome, pagesOf, sourceEditUrl, type SitePage } from '$lib/site-pages';

	let {
		page,
		section,
		type,
		moreTitle,
		othersLayout
	}: {
		page: SitePage;
		section: string;
		type: 'Article' | 'TechArticle';
		moreTitle: string;
		othersLayout: 'pills' | 'list';
	} = $props();
	const rendered = $derived(renderMarkdown(page.markdown));
	const homePage = $derived(collectionHome(page.collection)!);
	const others = $derived(
		pagesOf(page.collection).filter((p) => p.path !== page.path && p.path !== homePage.path)
	);
</script>

<SiteMeta
	title="{page.title} · {SITE_NAME}"
	description={page.description}
	path={page.path}
	ogType="article"
	markdownPath={page.markdownPath}
	structuredData={articleData({
		type,
		title: page.title,
		description: page.description,
		path: page.path,
		crumbs: [
			{ name: SITE_NAME, path: '/' },
			{ name: section, path: homePage.path },
			{ name: page.title, path: page.path }
		]
	})}
/>

<div class="collection">
	<article>
		<p class="eyebrow"><a href={homePage.path}>{section}</a></p>
		<h1>{page.title}</h1>
		<p class="lead">{page.description}</p>
		<MarkdownBody html={rendered.html} />

		<footer>
			<p class="others-title">{moreTitle}</p>
			<ul class="others {othersLayout}">
				{#each others as other (other.path)}
					<li><a href={other.path}>{other.title}</a></li>
				{/each}
			</ul>
			<p class="meta">
				<a href={page.markdownPath}>This page as Markdown</a>
				<a href={sourceEditUrl(page)} rel="noreferrer">Suggest a correction</a>
			</p>
		</footer>
	</article>
</div>

<style>
	.collection {
		max-width: 46rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vw, 4.5rem) 1.5rem 5rem;
	}
	.eyebrow {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}
	.eyebrow a:hover {
		color: var(--foreground);
	}
	h1 {
		margin-top: 0.375rem;
		font-size: clamp(1.875rem, 4vw, 2.5rem);
		line-height: 1.1;
		font-weight: 600;
		letter-spacing: -0.035em;
		text-wrap: balance;
	}
	.lead {
		margin-top: 0.875rem;
		font-size: 1.125rem;
		line-height: 1.55;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	footer {
		margin-top: 4rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	.others-title {
		font-size: 0.75rem;
		font-weight: 550;
		color: var(--muted-foreground);
	}
	.others {
		gap: 0.5rem;
		margin-top: 0.625rem;
	}
	.others a {
		border: 1px solid var(--border);
		transition: background 0.15s;
	}
	.others a:hover {
		background: var(--muted);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
	}
	.pills a {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		border-radius: 999px;
		font-size: 0.8125rem;
	}
	.list {
		display: grid;
	}
	.list a {
		display: block;
		padding: 0.625rem 0.875rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		line-height: 1.4;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		margin-top: 1.5rem;
		font-size: 0.8125rem;
	}
	.meta a {
		color: var(--muted-foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.meta a:hover {
		color: var(--foreground);
	}
</style>
