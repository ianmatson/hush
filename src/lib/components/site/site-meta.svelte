<script lang="ts">
	import { SITE_NAME, SITE_URL } from '$lib/site';
	import { jsonLdScript, type JsonLd } from '$lib/structured-data';

	/**
	 * Title, description, and link-preview tags for a public page. `path` gives the canonical URL
	 * (one address per page, also when it is opened on www or with a query string).
	 */
	let {
		title,
		description,
		path,
		noindex = false,
		ogType = 'website',
		markdownPath,
		structuredData = []
	}: {
		title: string;
		description: string;
		path: string;
		noindex?: boolean;
		ogType?: 'website' | 'article';
		markdownPath?: string;
		structuredData?: JsonLd[];
	} = $props();
	const url = $derived(SITE_URL + path);
	const image = `${SITE_URL}/og.png`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={url} />
		{#if markdownPath}
			<link rel="alternate" type="text/markdown" href={SITE_URL + markdownPath} />
		{/if}
		<meta property="og:type" content={ogType} />
		<meta property="og:site_name" content={SITE_NAME} />
		<meta property="og:title" content={title} />
		<meta property="og:description" content={description} />
		<meta property="og:url" content={url} />
		<meta property="og:image" content={image} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta name="twitter:card" content="summary_large_image" />
		{#each structuredData as data, i (i)}
			{@html jsonLdScript(data)}
		{/each}
	{/if}
</svelte:head>
