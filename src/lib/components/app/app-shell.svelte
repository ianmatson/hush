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
	import { openOrgNote } from '$lib/org-note.svelte';
	import OrgNote from './org-note.svelte';
	import Peek from './peek.svelte';
	import { closePeek, peek } from '$lib/peek.svelte';

	let { children }: { children: Snippet } = $props();

	$effect(() => watchReturns());

	// Just signed in (?signed_in=1 from the callback): once the profile is here, show which orgs
	// the sign-in can see (only when Hush uses it, not a custom token).
	let justSignedIn = $state(false);
	$effect(() => {
		const url = page.url;
		if (url.searchParams.get('signed_in') !== '1') return;
		justSignedIn = true;
		// A new sign-in can mean a new token: what this browser cached may be out of date.
		for (const queryKey of [keys.threadsAll, keys.dashAll, keys.teams])
			queryClient.invalidateQueries({ queryKey });
		url.searchParams.delete('signed_in');
		goto(url.pathname + url.search + url.hash, { replaceState: true, noScroll: true });
	});
	$effect(() => {
		if (!justSignedIn || !me.data) return;
		justSignedIn = false;
		if (me.data.tokenSource === 'app') openOrgNote().catch(() => {});
	});

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
			<OrgNote />
			<TabStatus />
			<CommandPalette />
			<AlertsPanel />
			<!-- One peek for the app: it stays open when you change tabs (lib/peek.svelte.ts). -->
			<Peek target={peek.target} onclose={closePeek} footer={peek.footer ?? undefined} />
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
