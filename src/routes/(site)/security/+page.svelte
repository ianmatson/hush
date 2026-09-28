<script lang="ts">
	import AboutArticle from '$lib/components/site/about-article.svelte';
	import { aboutBySlug } from '$lib/about';

	const page = aboutBySlug('security')!;
</script>

<AboutArticle {page} />
