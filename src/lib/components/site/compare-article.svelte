<script lang="ts">
	import SiteMeta from './site-meta.svelte';
	import MarkdownBody from './markdown-body.svelte';
	import { REPO_URL } from '$lib/site';
	import { renderMarkdown } from '$lib/docs';
	import {
		COMPARE,
		COMPARE_INDEX,
		compareMarkdownPath,
		comparePath,
		type ComparePage
	} from '$lib/compare';

	let { page }: { page: ComparePage } = $props();
	const rendered = $derived(renderMarkdown(page.markdown));
	const others = $derived(COMPARE.filter((p) => p !== page));
	const source = $derived(`${REPO_URL}/blob/main/src/lib/compare/pages/${page.slug}.md`);
</script>

<SiteMeta title="{page.title} · Hush" description={page.description} path={comparePath(page)} />

<main class="compare">
	<article>
		<p class="eyebrow"><a href={COMPARE_INDEX.path}>Compare</a></p>
		<h1>{page.title}</h1>
		<p class="lead">{page.description}</p>
		<MarkdownBody html={rendered.html} />

		<footer>
			<p class="others-title">More comparisons</p>
			<ul class="others">
				{#each others as other (other.slug)}
					<li><a href={comparePath(other)}>{other.title}</a></li>
				{/each}
			</ul>
			<p class="meta">
				<a href={compareMarkdownPath(page)}>This page as Markdown</a>
				<a href={source} rel="noreferrer">Suggest a correction</a>
			</p>
		</footer>
	</article>
</main>

<style>
	.compare {
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
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.625rem;
	}
	.others a {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.8125rem;
		transition: background 0.15s;
	}
	.others a:hover {
		background: var(--muted);
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
