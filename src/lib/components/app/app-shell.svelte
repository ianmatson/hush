<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery, useIsRestoring } from '@tanstack/svelte-query';
	import { ApiError } from '$lib/api';
	import { keys, leaveTo, meQuery, queryClient } from '$lib/queries';
	import AppHeader from './app-header.svelte';
	import TabStatus from './tab-status.svelte';
	import CommandPalette from './command-palette.svelte';
	import AlertsPanel from './alerts-panel.svelte';
	import { watchReturns } from '$lib/recheck';
	import { connectLive } from '$lib/live.svelte';

	let { children }: { children: Snippet } = $props();

	$effect(() => watchReturns());

	const isRestoring = useIsRestoring();
	const me = createQuery(meQuery);
	// Signed in: open the live socket (the server says what changed). Once per page: the profile
	// can flicker while the saved cache loads, and sign-out reloads the page anyway.
	let liveStarted = false;
	$effect(() => {
		if (me.data && !liveStarted) {
			liveStarted = true;
			connectLive();
		}
	});

	// Check the session once per page load, even when the cached profile is fresh.
	// Cached data shows at once; a 401 sends you to sign-in (see the QueryCache handler).
	let checked = false;
	$effect(() => {
		if (!isRestoring.current && !checked) {
			checked = true;
			queryClient.invalidateQueries({ queryKey: keys.me });
		}
	});
	const signedOut = $derived(me.error instanceof ApiError && me.error.status === 401);
	const onLogin = $derived(page.url.pathname === '/login');
	let startChecked = false;

	$effect(() => {
		if (signedOut && !onLogin) leaveTo('/login');
		else if (me.isSuccess && onLogin) goto('/inbox', { replaceState: true });
		else if (me.isSuccess && !startChecked) {
			startChecked = true;
			// Start page preference (Settings → Appearance).
			const start = localStorage.getItem('hush:start');
			if (
				page.url.pathname === '/inbox' &&
				!page.url.search &&
				(start === '/pulls' || start === '/issues')
			)
				goto(start, { replaceState: true });
		}
	});

	// Show the page as soon as we know who you are (the persisted cache usually knows at once).
	const ready = $derived(
		!isRestoring.current && (me.data !== undefined || signedOut || onLogin || me.isError)
	);
</script>

<!-- Links load their page's code as soon as they are on screen (not on hover), so a first
     visit opens at once, also from a shortcut or the palette. -->
<div class="min-h-dvh" data-sveltekit-preload-code="eager">
	{#if ready}
		{#if me.data && !signedOut && !onLogin}
			<AppHeader />
			<TabStatus />
			<CommandPalette />
			<AlertsPanel />
		{/if}
		{#if me.isError && !signedOut && !onLogin}
			<p class="mx-auto max-w-4xl px-4 pt-6 text-sm text-destructive">
				Hush cannot reach its server: {me.error.message}
			</p>
		{:else}
			{@render children()}
		{/if}
	{/if}
</div>
