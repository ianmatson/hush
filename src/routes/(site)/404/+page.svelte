<script lang="ts">
	// Static HTML with no JavaScript: Cloudflare serves it (status 404) for any path with no file.
	import SiteMeta from '$lib/components/site/site-meta.svelte';
</script>

<SiteMeta
	title="Page not found · Hush for GitHub"
	description="There is no page at this address."
	path="/404"
	noindex
/>

<section
	class="mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-6 py-24 text-center sm:py-32"
>
	<h1 class="text-xl font-semibold">Page not found</h1>
	<p class="text-sm text-muted-foreground">There is no page at this address.</p>
	<p class="flex gap-5 text-sm">
		<a href="/" class="underline underline-offset-4">Go to Hush</a>
		<a href="/docs" class="underline underline-offset-4">Read the docs</a>
	</p>
</section>
