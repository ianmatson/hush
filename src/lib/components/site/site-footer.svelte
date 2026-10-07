<script lang="ts">
	import { APP_URL, REPO_URL, SUPPORT_EMAIL } from '$lib/site';
	import { COMPARE_PAGES, GUIDE_PAGES, SITE_ABOUT_PAGES, SITE_SECTIONS } from './site-nav';
</script>

<footer class="foot">
	<a href="/" class="brand"><img src="/icon.svg" alt="" />hush</a>
	<div class="links">
		<nav aria-label="Site">
			{#each [...SITE_SECTIONS, ...SITE_ABOUT_PAGES] as link (link.href)}
				<a href={link.href}>{link.label}</a>
			{/each}
			<a href={REPO_URL} rel="noreferrer">GitHub</a>
			<a href="mailto:{SUPPORT_EMAIL}">Support</a>
			<a href="{APP_URL}/login">Sign in</a>
		</nav>
		{#if GUIDE_PAGES.length > 0}
			<nav aria-label="Guides">
				{#each GUIDE_PAGES as link (link.href)}
					<a href={link.href}>{link.label}</a>
				{/each}
			</nav>
		{/if}
		{#if COMPARE_PAGES.length > 0}
			<nav aria-label="Compare">
				{#each COMPARE_PAGES as link (link.href)}
					<a href={link.href}>{link.label}</a>
				{/each}
			</nav>
		{/if}
	</div>
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
		width: 100%;
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
	.links {
		display: grid;
		gap: 0.5rem;
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
	a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
		border-radius: 0.25rem;
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
