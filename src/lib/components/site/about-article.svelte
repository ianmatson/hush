<script lang="ts">
	import SiteMeta from './site-meta.svelte';
	import MarkdownBody from './markdown-body.svelte';
	import type { AboutPage } from '$lib/about';
	import { renderMarkdown } from '$lib/docs';

	/** A page for one question (privacy, security): a title, a lead, and its Markdown. */
	let { page }: { page: AboutPage } = $props();
	const rendered = $derived(renderMarkdown(page.markdown));
</script>

<SiteMeta title="{page.title} · Hush" description={page.description} path="/{page.slug}" />

<article>
	<h1>{page.title}</h1>
	<p class="lead">{page.description}</p>
	<MarkdownBody html={rendered.html} />
	<p class="md"><a href="/{page.slug}.md">This page as Markdown</a></p>
</article>

<style>
	article {
		max-width: 44rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vw, 5rem) 1.5rem 5rem;
	}
	h1 {
		font-size: clamp(2.25rem, 5vw, 3.25rem);
		line-height: 1.05;
		font-weight: 550;
		letter-spacing: -0.04em;
	}
	.lead {
		margin-top: 1rem;
		font-size: 1.1875rem;
		line-height: 1.55;
		color: var(--muted-foreground);
		text-wrap: pretty;
	}
	.md {
		margin-top: 4rem;
		font-size: 0.8125rem;
	}
	.md a {
		color: var(--muted-foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
