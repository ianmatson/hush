<script lang="ts">
	import DocArticle from '$lib/components/site/doc-article.svelte';

	let { data } = $props();
</script>

<DocArticle doc={data.doc} />
