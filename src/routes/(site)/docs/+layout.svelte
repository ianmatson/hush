<script lang="ts">
	import { page } from '$app/state';
	import { DOCS, NAV, docPath } from '$lib/docs';

	// Plain HTML: the menu is a <details>, so it works with no JavaScript.
	let { children } = $props();
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
	@media (min-width: 60rem) {
		.body {
			grid-template-columns: 14rem minmax(0, 1fr);
			gap: 3rem;
		}
		aside {
			display: block;
			position: sticky;
			top: 0;
			align-self: start;
			max-height: 100dvh;
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
		border-block: 1px solid var(--border);
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
