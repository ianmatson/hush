<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { START_PAGE_KEY, startPath } from '$lib/start-page';

	const me = createQuery(meQuery);
	$effect(() => {
		const views = me.data?.settings.views;
		if (!views?.length) return;
		const path = startPath(views, localStorage.getItem(START_PAGE_KEY));
		goto(`${path}${page.url.search}`, { replaceState: true });
	});
</script>
