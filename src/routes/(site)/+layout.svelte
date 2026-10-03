<script lang="ts">
	import { page } from '$app/state';
	import SiteHeader from '$lib/components/site/site-header.svelte';
	import SiteFooter from '$lib/components/site/site-footer.svelte';
	import { isCurrentSection } from '$lib/components/site/site-nav';

	let { children } = $props();
	const MAIN_CONTENT_ID = 'main';
	const hasDocsSidebar = $derived(isCurrentSection(page.url.pathname, '/docs'));
</script>

<div class="site" class:wide={hasDocsSidebar}>
	<a class="skip" href="#{MAIN_CONTENT_ID}">Skip to content</a>
	<SiteHeader />
	<main id={MAIN_CONTENT_ID} tabindex="-1">
		{@render children()}
	</main>
	<SiteFooter />
</div>

<style>
	.site {
		--width: 68rem;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.site.wide {
		--width: 80rem;
	}
	main {
		flex: 1;
		outline: none;
	}
	.skip {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 50;
		padding: 0.5rem 0.875rem;
		border-radius: 0.5rem;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.875rem;
		font-weight: 500;
		translate: 0 -200%;
	}
	.skip:focus {
		translate: 0 0;
	}
	.skip:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
</style>
