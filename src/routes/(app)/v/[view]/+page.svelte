<script lang="ts">
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import Dashboard from '$lib/components/app/dashboard.svelte';

	const me = createQuery(meQuery);
	const view = $derived(me.data?.settings.views.find((v) => v.id === page.params.view) ?? null);
</script>

<svelte:head><title>{view?.name ?? 'View'} · Hush</title></svelte:head>
{#if view}
	{#key view.id}<Dashboard {view} />{/key}
{:else if me.data}
	<main data-page class="mx-auto max-w-4xl px-4 pt-10 text-center">
		<p class="font-medium">This view is gone.</p>
		<p class="mt-1 text-sm text-muted-foreground">
			<a class="underline" href="/settings/views">Edit your views</a>, or open one in the top bar.
		</p>
	</main>
{/if}
