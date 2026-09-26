<script lang="ts">
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppShell from '$lib/components/app/app-shell.svelte';
	import { persistOptions, queryClient } from '$lib/queries';
	import { ui } from '$lib/ui.svelte';

	let { children } = $props();
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
