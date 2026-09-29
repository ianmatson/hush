<script lang="ts">
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppShell from '$lib/components/app/app-shell.svelte';
	import { persistOptions, queryClient } from '$lib/queries';
	import { ui } from '$lib/ui.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';

	let { children } = $props();

	// A Home Screen app can stay suspended for days and resume with the old code. When it comes
	// back to the screen, check for a new version and load it; with one known, the next link
	// loads the whole page.
	onMount(() => {
		const onVisible = async () => {
			if (document.visibilityState === 'visible' && (await updated.check())) location.reload();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<!-- 8 s: long enough to read a toast and press Undo. -->
<Toaster position="bottom-center" duration={8000} offset={{ bottom: ui.bulkBarOpen ? 92 : 24 }} />
<PersistQueryClientProvider client={queryClient} {persistOptions}>
	<Tooltip.Provider delayDuration={300}>
		<AppShell>{@render children()}</AppShell>
	</Tooltip.Provider>
</PersistQueryClientProvider>
