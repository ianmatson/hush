<script lang="ts">
	import { APP_URL, REPO_URL } from '$lib/site';

	/** The public pages' footer: every page for a particular question. */
</script>

<footer class="foot">
	<a href="/" class="brand"><img src="/icon.svg" alt="" />hush</a>
	<nav aria-label="Site">
		<a href="/docs">Docs</a>
		<a href="/pricing">Pricing</a>
		<a href="/privacy">Privacy</a>
		<a href="/security">Security</a>
		<a href={REPO_URL} rel="noreferrer">Source</a>
		<a href="{APP_URL}/login">Sign in</a>
	</nav>
</footer>

<style>
	/* The line spans the content only, like the lines above it. */
	.foot {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 2rem;
		max-width: var(--width, 68rem);
		margin: 0 auto;
		padding: 1.75rem 1.5rem 2.5rem;
	}
	.foot::before {
		content: '';
		position: absolute;
		top: 0;
		left: 1.5rem;
		right: 1.5rem;
		border-top: 1px solid var(--border);
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		font-size: 0.875rem;
	}
	nav a {
		color: var(--muted-foreground);
		transition: color 0.2s;
	}
	nav a:hover {
		color: var(--foreground);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.brand img {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 0.3rem;
	}
</style>
