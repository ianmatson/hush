<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';

	// Shared by the public pages and the app; the app's providers are in (app)/+layout.svelte.
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/icon-192.png" />
	<meta name="theme-color" content="#0a0a0a" />
	<title>Hush</title>
</svelte:head>

<ModeWatcher />
{@render children()}
