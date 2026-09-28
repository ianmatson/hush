<script lang="ts">
	import { APP_URL, REPO_URL } from '$lib/site';

	/** The public pages' top bar. Small screens keep the brand, Docs, Pricing, and Open Hush. */
</script>

<header class="nav">
	<a href="/" class="brand"><img src="/icon.svg" alt="" />hush</a>
	<nav>
		<a href="/docs">Docs</a>
		<a href="/pricing">Pricing</a>
		<a class="wide" href={REPO_URL} rel="noreferrer">Source</a>
		<a class="wide" href="{APP_URL}/login">Sign in</a>
		<a class="open" href="{APP_URL}/inbox">Open Hush</a>
	</nav>
</header>

<style>
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: var(--width, 68rem);
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		font-size: 0.875rem;
	}
	nav a:not(.open) {
		color: var(--muted-foreground);
		transition: color 0.2s;
	}
	nav a:not(.open):hover {
		color: var(--foreground);
	}
	@media (max-width: 36rem) {
		.wide {
			display: none;
		}
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
</style>
