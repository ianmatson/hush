<script lang="ts">
	import GuideArticle from '$lib/components/site/guide-article.svelte';

	let { data } = $props();
</script>

<GuideArticle page={data.page} />
