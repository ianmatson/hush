<script lang="ts">
	import SiteMeta from './site-meta.svelte';
	import MarkdownBody from './markdown-body.svelte';
	import { REPO_URL, SITE_NAME } from '$lib/site';
	import { articleData } from '$lib/structured-data';
	import { DOCS, docMarkdownPath, docPath, renderMarkdown, type DocPage } from '$lib/docs';

	/** One docs page: its title, its sections ("On this page"), the text, and the next pages. */
	let { doc }: { doc: DocPage } = $props();
	const rendered = $derived(renderMarkdown(doc.markdown));
	const at = $derived(DOCS.indexOf(doc));
	const prev = $derived(DOCS[at - 1]);
	const next = $derived(DOCS[at + 1]);
	const source = $derived(`${REPO_URL}/blob/main/src/lib/docs/pages/${doc.slug || 'index'}.md`);
</script>

<SiteMeta
	title={doc.slug ? `${doc.title} · ${SITE_NAME} docs` : `${SITE_NAME} docs`}
	description={doc.description}
	path={docPath(doc)}
	ogType="article"
	markdownPath={docMarkdownPath(doc)}
	structuredData={articleData({
		type: 'TechArticle',
		title: doc.title,
		description: doc.description,
		path: docPath(doc),
		crumbs: [
			{ name: SITE_NAME, path: '/' },
			{ name: 'Docs', path: '/docs' },
			...(doc.slug ? [{ name: doc.title, path: docPath(doc) }] : [])
		]
	})}
/>

<div class="page">
	<article>
		<p class="eyebrow">{doc.group}</p>
		<h1>{doc.title}</h1>
		<p class="lead">{doc.description}</p>
		<MarkdownBody html={rendered.html} />

		<footer>
			<nav class="pager" aria-label="Next and previous page">
				{#if prev}
					<a href={docPath(prev)}><span>Previous</span>{prev.slug ? prev.title : 'Overview'}</a>
				{:else}<span></span>{/if}
				{#if next}
					<a class="next" href={docPath(next)}><span>Next</span>{next.title}</a>
				{/if}
			</nav>
			<p class="meta">
				<a href={docMarkdownPath(doc)}>This page as Markdown</a>
				<a href={source} rel="noreferrer">Edit this page</a>
			</p>
		</footer>
	</article>

	{#if rendered.toc.length > 1}
		<nav class="toc" aria-label="On this page">
			<p>On this page</p>
			<ul>
				{#each rendered.toc as h (h.id)}
					<li><a href="#{h.id}">{h.text}</a></li>
				{/each}
			</ul>
		</nav>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 3rem;
		padding: 2.5rem 0 5rem;
	}
	@media (min-width: 80rem) {
		.page {
			grid-template-columns: minmax(0, 1fr) 13rem;
		}
	}
	article {
		min-width: 0;
		max-width: 46rem;
	}
	.eyebrow {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--muted-foreground);
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

	.toc {
		display: none;
	}
	@media (min-width: 80rem) {
		.toc {
			display: block;
			position: sticky;
			top: 2rem;
			align-self: start;
			max-height: calc(100dvh - 3rem);
			overflow-y: auto;
		}
	}
	.toc p {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 550;
		color: var(--muted-foreground);
	}
	.toc a {
		display: block;
		padding: 0.25rem 0;
		font-size: 0.8125rem;
		line-height: 1.35;
		color: var(--muted-foreground);
	}
	.toc a:hover {
		color: var(--foreground);
	}

	footer {
		margin-top: 4rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	.pager {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.pager a {
		display: grid;
		gap: 0.125rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		font-weight: 500;
		transition: background 0.15s;
	}
	.pager a:hover {
		background: var(--muted);
	}
	.pager span {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--muted-foreground);
	}
	.pager .next {
		text-align: right;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		margin-top: 1.25rem;
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
