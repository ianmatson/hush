<script lang="ts">
	import AboutArticle from '$lib/components/site/about-article.svelte';
	import { sitePageAt } from '$lib/site-pages';

	const page = sitePageAt('/security');
</script>

<AboutArticle {page} />
