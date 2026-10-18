<script lang="ts">
	import CollectionArticle from '$lib/components/site/collection-article.svelte';

	let { data } = $props();
</script>

<CollectionArticle
	page={data.page}
	section="Guides"
	type="TechArticle"
	moreTitle="More guides"
	othersLayout="list"
/>
