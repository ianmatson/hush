<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppShell from '$lib/components/app/app-shell.svelte';
	import { persistOptions, queryClient } from '$lib/queries';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
	<meta name="theme-color" content="#0a0a0a" />
	<title>Hush</title>
</svelte:head>

<ModeWatcher />
<Toaster position="bottom-center" />
<PersistQueryClientProvider client={queryClient} {persistOptions}>
	<Tooltip.Provider delayDuration={300}>
		<AppShell>{@render children()}</AppShell>
	</Tooltip.Provider>
</PersistQueryClientProvider>
