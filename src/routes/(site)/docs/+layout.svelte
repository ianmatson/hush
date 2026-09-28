<script lang="ts">
	import { page } from '$app/state';
	import { DOCS, NAV, docPath } from '$lib/docs';
	import { APP_URL } from '$lib/site';

	// The docs shell: the header, and the page list (a sidebar, or a menu on small screens).
	// Plain HTML: the menu is a <details>, so it works with no JavaScript.
	let { children } = $props();
	const REPO = 'https://github.com/ianmatson/hush';
	const groups = NAV.map((g) => ({
		group: g.group,
		pages: g.pages.map((s) => DOCS.find((d) => d.slug === s)!)
	}));
	const here = $derived(page.url.pathname.replace(/\/$/, '') || '/docs');
</script>

{#snippet list()}
	{#each groups as g (g.group)}
		<div class="group">
			<p>{g.group}</p>
			<ul>
				{#each g.pages as d (d.slug)}
					<li>
						<a href={docPath(d)} aria-current={here === docPath(d) ? 'page' : undefined}
							>{d.slug ? d.title : 'Overview'}</a
						>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
{/snippet}

<div class="docs">
	<header>
		<a href="/" class="brand"><img src="/icon.svg" alt="" />hush</a>
		<a href="/docs" class="section">Docs</a>
		<nav>
			<a class="source" href={REPO} rel="noreferrer">Source</a>
			<a class="open" href="{APP_URL}/inbox">Open Hush</a>
		</nav>
	</header>

	<details class="menu">
		<summary>Pages</summary>
		<nav aria-label="Docs">{@render list()}</nav>
	</details>

	<div class="body">
		<aside>
			<nav aria-label="Docs">{@render list()}</nav>
		</aside>
		<div class="main">{@render children()}</div>
	</div>
</div>

<style>
	.docs {
		--width: 80rem;
		min-height: 100dvh;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: var(--width);
		margin: 0 auto;
		padding: 0.875rem 1.5rem;
		background: color-mix(in oklab, var(--background) 88%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.brand img {
		width: 1.375rem;
		height: 1.375rem;
		border-radius: 0.375rem;
	}
	.section {
		padding-left: 0.75rem;
		border-left: 1px solid var(--border);
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}
	header nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-left: auto;
		font-size: 0.875rem;
	}
	header nav a:not(.open) {
		color: var(--muted-foreground);
	}
	header nav a:not(.open):hover {
		color: var(--foreground);
	}
	.open {
		padding: 0.3125rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
	}
	.open:hover {
		opacity: 0.85;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		max-width: var(--width);
		margin: 0 auto;
		padding: 0 1.5rem;
	}
	aside {
		display: none;
	}
	.main {
		min-width: 0;
	}
	@media (max-width: 30rem) {
		.source {
			display: none;
		}
	}
	@media (min-width: 60rem) {
		.body {
			grid-template-columns: 14rem minmax(0, 1fr);
			gap: 3rem;
		}
		aside {
			display: block;
			position: sticky;
			top: 3.75rem;
			align-self: start;
			max-height: calc(100dvh - 3.75rem);
			overflow-y: auto;
			padding: 2rem 0 3rem;
		}
		.menu {
			display: none;
		}
	}
	.group + .group {
		margin-top: 1.5rem;
	}
	.group p {
		margin-bottom: 0.375rem;
		padding: 0 0.625rem;
		font-size: 0.75rem;
		font-weight: 550;
		color: var(--muted-foreground);
	}
	.group a {
		display: block;
		padding: 0.3125rem 0.625rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: var(--muted-foreground);
		transition:
			color 0.15s,
			background 0.15s;
	}
	.group a:hover {
		color: var(--foreground);
		background: var(--muted);
	}
	.group a[aria-current='page'] {
		color: var(--foreground);
		background: var(--muted);
		font-weight: 500;
	}

	.menu {
		max-width: var(--width);
		margin: 0 auto;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid var(--border);
	}
	.menu summary {
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
	}
	.menu nav {
		padding: 1rem 0 0.5rem;
	}
</style>
