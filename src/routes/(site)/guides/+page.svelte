<script lang="ts">
	import CollectionIndex from '$lib/components/site/collection-index.svelte';
	import { GUIDES_INTRO } from '$lib/guides';
</script>

<CollectionIndex
	collection="guides"
	section="Guides"
	type="TechArticle"
	cardsLabel="Guides"
	wideCards
>
	<p class="intro">{GUIDES_INTRO}</p>
</CollectionIndex>

<style>
	.intro {
		margin-top: 0.75rem;
		max-width: 42rem;
		font-size: 0.9375rem;
		line-height: 1.6;
		text-wrap: pretty;
	}
</style>
