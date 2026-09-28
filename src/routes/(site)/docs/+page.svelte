<script lang="ts">
	import DocArticle from '$lib/components/site/doc-article.svelte';
	import { docBySlug } from '$lib/docs';

	const doc = docBySlug('')!;
</script>

<DocArticle {doc} />
