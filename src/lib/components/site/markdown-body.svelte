<script lang="ts">
	/** Markdown that the site rendered at build time (lib/docs), with the docs' text styles. */
	let { html }: { html: string } = $props();
</script>

<!-- Our own Markdown (the docs and the about pages), rendered at build time. -->
<div class="doc">{@html html}</div>

<style>
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
	.doc :global(.table-scroll) {
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
