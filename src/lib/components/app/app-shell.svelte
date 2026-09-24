<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery, useIsRestoring } from '@tanstack/svelte-query';
	import { ApiError } from '$lib/api';
	import { meQuery } from '$lib/queries';
	import AppHeader from './app-header.svelte';

	let { children }: { children: Snippet } = $props();

	const isRestoring = useIsRestoring();
	const me = createQuery(meQuery);
	const signedOut = $derived(me.error instanceof ApiError && me.error.status === 401);
	const onLogin = $derived(page.url.pathname === '/login');
	let startChecked = false;

	$effect(() => {
		if (signedOut && !onLogin) goto('/login', { replaceState: true });
		else if (me.isSuccess && onLogin) goto('/', { replaceState: true });
		else if (me.isSuccess && !startChecked) {
			startChecked = true;
			// Start page preference (Settings → Appearance).
			const start = localStorage.getItem('hush:start');
			if (page.url.pathname === '/' && !page.url.search && start && start !== '/')
				goto(start, { replaceState: true });
		}
	});

	// Show the page as soon as we know who you are (the persisted cache usually knows at once).
	const ready = $derived(
		!isRestoring.current && (me.data !== undefined || signedOut || onLogin || me.isError)
	);
</script>

<div class="min-h-dvh">
	{#if ready}
		{#if me.data && !signedOut && !onLogin}
			<AppHeader />
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
