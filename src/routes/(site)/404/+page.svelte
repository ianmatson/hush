<script lang="ts">
	// Static HTML with no JavaScript: Cloudflare serves it (status 404) for any path with no file.
	import SiteMeta from '$lib/components/site/site-meta.svelte';
</script>

<SiteMeta
	title="Page not found · Hush"
	description="There is no page at this address."
	path="/404"
	noindex
/>

<main
	class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center"
>
	<img src="/icon.svg" alt="" class="size-10 rounded-lg" />
	<h1 class="text-xl font-semibold">Page not found</h1>
	<p class="text-sm text-muted-foreground">There is no page at this address.</p>
	<a href="/" class="text-sm underline underline-offset-4">Go to Hush</a>
</main>
