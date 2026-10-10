<script lang="ts">
	import { page } from '$app/state';
	import { APP_URL, REPO_URL } from '$lib/site';
	import { HEADER_SECTIONS, isCurrentSection } from './site-nav';

	const pathname = $derived(page.url.pathname);
	const currentFor = (href: string) => (isCurrentSection(pathname, href) ? 'page' : undefined);
</script>

<header class="nav">
	<a href="/" class="brand" aria-current={pathname === '/' ? 'page' : undefined}>
		<img src="/icon.svg" alt="" />hush
	</a>

	<nav class="wide" aria-label="Main">
		{#each HEADER_SECTIONS as section (section.href)}
			<a href={section.href} aria-current={currentFor(section.href)}>{section.label}</a>
		{/each}
		<a href={REPO_URL} rel="noreferrer">Source</a>
		<a href="{APP_URL}/login">Sign in</a>
		<a class="open" href="{APP_URL}/v">Open Hush</a>
	</nav>

	<div class="narrow">
		<a class="open" href="{APP_URL}/v">Open Hush</a>
		<details class="menu">
			<summary aria-label="Menu">
				<svg viewBox="0 0 20 20" aria-hidden="true">
					<path d="M3 6h14M3 10h14M3 14h14" />
				</svg>
			</summary>
			<nav aria-label="Main">
				{#each HEADER_SECTIONS as section (section.href)}
					<a href={section.href} aria-current={currentFor(section.href)}>{section.label}</a>
				{/each}
				<a href={REPO_URL} rel="noreferrer">Source</a>
				<a href="{APP_URL}/login">Sign in</a>
			</nav>
		</details>
	</div>
</header>

<style>
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		max-width: var(--width, 68rem);
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.brand img {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.4375rem;
	}
	nav {
		font-size: 0.875rem;
	}
	nav a:not(.open) {
		color: var(--muted-foreground);
		transition: color 0.2s;
	}
	nav a:not(.open):hover,
	nav a[aria-current='page'] {
		color: var(--foreground);
	}
	nav a[aria-current='page'] {
		font-weight: 500;
	}
	.wide {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}
	.narrow {
		display: none;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}
	@media (max-width: 40rem) {
		.wide {
			display: none;
		}
		.narrow {
			display: flex;
		}
	}
	.open {
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-weight: 500;
		transition: opacity 0.2s;
	}
	.open:hover {
		opacity: 0.85;
	}
	a:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
		border-radius: 0.375rem;
	}

	.menu {
		position: relative;
	}
	.menu summary {
		display: grid;
		place-items: center;
		width: 2.125rem;
		height: 2.125rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		cursor: pointer;
		list-style: none;
	}
	.menu summary::-webkit-details-marker {
		display: none;
	}
	.menu[open] summary {
		background: var(--muted);
	}
	.menu svg {
		width: 1.125rem;
		height: 1.125rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.menu nav {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 20;
		display: grid;
		min-width: 11rem;
		padding: 0.375rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		background: var(--popover);
		box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.25);
	}
	.menu nav a {
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
	}
	.menu nav a:hover,
	.menu nav a[aria-current='page'] {
		background: var(--muted);
	}
</style>
