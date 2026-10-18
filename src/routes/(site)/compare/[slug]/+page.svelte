<script lang="ts">
	import CollectionArticle from '$lib/components/site/collection-article.svelte';

	let { data } = $props();
</script>

<CollectionArticle
	page={data.page}
	section="Compare"
	type="Article"
	moreTitle="More comparisons"
	othersLayout="pills"
/>
