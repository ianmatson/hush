<script lang="ts">
	import CollectionIndex from '$lib/components/site/collection-index.svelte';
	import MarkdownBody from '$lib/components/site/markdown-body.svelte';
	import { renderMarkdown } from '$lib/docs';
	import { collectionHome } from '$lib/site-pages';

	const rendered = renderMarkdown(collectionHome('compare')!.markdown);
</script>

<CollectionIndex
	collection="compare"
	section="Compare"
	type="Article"
	ogType="article"
	cardsLabel="Comparisons"
	cardsTitle="Every comparison"
>
	<MarkdownBody html={rendered.html} />
</CollectionIndex>
