<script lang="ts">
	import SiteMeta from '$lib/components/site/site-meta.svelte';
	import { APP_URL } from '$lib/site';
</script>

<SiteMeta
	title="Hush · GitHub notifications that only show what needs you"
	description="Hush sorts your GitHub notifications into what needs you and what is only FYI, and pushes only the first."
	path="/"
/>

<main class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-16">
	<div class="flex items-center gap-3">
		<img src="/icon.svg" alt="" class="size-10 rounded-xl" />
		<span class="text-xl font-semibold tracking-tight">hush</span>
	</div>
	<h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
		GitHub notifications that only show what needs you.
	</h1>
	<p class="text-muted-foreground">
		Hush sorts your notifications into “Needs you” and “FYI”, shows whose turn it is on your pull
		requests and issues, and sends a push only when something waits on you.
	</p>
	<div class="flex flex-wrap gap-3">
		<a
			href="{APP_URL}/inbox"
			class="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
			>Open Hush</a
		>
		<a
			href="{APP_URL}/login"
			class="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium">Sign in</a
		>
	</div>
</main>
