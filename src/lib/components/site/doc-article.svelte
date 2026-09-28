<script lang="ts">
	import SiteMeta from './site-meta.svelte';
	import { DOCS, docMarkdownPath, docPath, renderDoc, type DocPage } from '$lib/docs';

	/** One docs page: its title, its sections ("On this page"), the text, and the next pages. */
	let { doc }: { doc: DocPage } = $props();
	const REPO = 'https://github.com/ianmatson/hush';
	const rendered = $derived(renderDoc(doc));
	const at = $derived(DOCS.indexOf(doc));
	const prev = $derived(DOCS[at - 1]);
	const next = $derived(DOCS[at + 1]);
	const source = $derived(`${REPO}/blob/main/src/lib/docs/pages/${doc.slug || 'index'}.md`);
</script>

<SiteMeta
	title={doc.slug ? `${doc.title} · Hush docs` : 'Hush docs'}
	description={doc.description}
	path={docPath(doc)}
/>

<div class="page">
	<article>
		<p class="eyebrow">{doc.group}</p>
		<h1>{doc.title}</h1>
		<p class="lead">{doc.description}</p>
		<!-- The docs' own Markdown (src/lib/docs/pages), rendered at build time. -->
		<div class="doc">{@html rendered.html}</div>

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
			top: 5.75rem;
			align-self: start;
			max-height: calc(100dvh - 7rem);
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

	/* The rendered Markdown. */
	.doc {
		margin-top: 2rem;
		font-size: 0.9875rem;
		line-height: 1.7;
	}
	.doc :global(> * + *) {
		margin-top: 1rem;
	}
	.doc :global(h2) {
		margin-top: 3rem;
		padding-top: 0.5rem;
		font-size: 1.375rem;
		line-height: 1.3;
		font-weight: 600;
		letter-spacing: -0.02em;
		scroll-margin-top: 5rem;
	}
	.doc :global(h3) {
		margin-top: 2.25rem;
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		scroll-margin-top: 5rem;
	}
	.doc :global(h4) {
		margin-top: 1.75rem;
		font-weight: 600;
		scroll-margin-top: 5rem;
	}
	.doc :global(:is(h2, h3, h4) + *) {
		margin-top: 0.75rem;
	}
	.doc :global(.anchor) {
		color: inherit;
	}
	.doc :global(.anchor:hover::after) {
		content: ' #';
		color: var(--muted-foreground);
	}
	.doc :global(p a),
	.doc :global(li a),
	.doc :global(td a) {
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, var(--foreground) 30%, transparent);
		text-underline-offset: 3px;
	}
	.doc :global(p a:hover),
	.doc :global(li a:hover),
	.doc :global(td a:hover) {
		text-decoration-color: var(--foreground);
	}
	.doc :global(strong) {
		font-weight: 600;
	}
	.doc :global(ul),
	.doc :global(ol) {
		padding-left: 1.25rem;
	}
	.doc :global(ul) {
		list-style: disc;
	}
	.doc :global(ol) {
		list-style: decimal;
	}
	.doc :global(li + li),
	.doc :global(li > ul) {
		margin-top: 0.375rem;
	}
	.doc :global(li::marker) {
		color: var(--muted-foreground);
	}
	.doc :global(code) {
		padding: 0.1em 0.35em;
		border-radius: 0.3rem;
		background: var(--muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85em;
	}
	.doc :global(pre) {
		position: relative;
		overflow-x: auto;
		padding: 1rem 1.125rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--muted) 60%, var(--background));
		font-size: 0.8125rem;
		line-height: 1.6;
		tab-size: 2;
	}
	.doc :global(pre code) {
		padding: 0;
		background: none;
		font-size: inherit;
	}
	.doc :global(pre[data-lang]::before) {
		content: attr(data-lang);
		position: absolute;
		top: 0.375rem;
		right: 0.625rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}
	.doc :global(.table) {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
	}
	.doc :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.doc :global(th) {
		padding: 0.5rem 0.875rem;
		background: color-mix(in oklab, var(--muted) 60%, var(--background));
		font-weight: 550;
		text-align: left;
		white-space: nowrap;
	}
	.doc :global(td) {
		padding: 0.5rem 0.875rem;
		border-top: 1px solid var(--border);
		vertical-align: top;
	}
	.doc :global(td:first-child code) {
		white-space: nowrap;
	}
	.doc :global(blockquote) {
		padding-left: 1rem;
		border-left: 2px solid var(--border);
		color: var(--muted-foreground);
	}
	.doc :global(hr) {
		margin: 2.5rem 0;
		border-color: var(--border);
	}
</style>
