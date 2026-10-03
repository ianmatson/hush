<script lang="ts">
	import CompareArticle from '$lib/components/site/compare-article.svelte';

	let { data } = $props();
</script>

<CompareArticle page={data.page} />
