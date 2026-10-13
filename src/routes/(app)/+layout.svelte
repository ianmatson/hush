<script lang="ts">
	import { PersistQueryClientProvider } from '@tanstack/svelte-query-persist-client';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppShell from '$lib/components/app/app-shell.svelte';
	import ItemTransition from '$lib/components/app/item-transition.svelte';
	import { persistOptions, queryClient } from '$lib/queries';
	import { ui } from '$lib/ui.svelte';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';

	let { children } = $props();

	const TOAST_GAP = 24;
	const MOBILE_TOAST_GAP = 16;
	const TOAST_ABOVE_BOTTOM_BAR = 92;
	const bottomBarOpen = $derived(ui.bulkBarOpen || ui.itemDockOpen);

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
<Toaster
	position="bottom-center"
	swipeDirections={['left', 'right', 'bottom']}
	duration={8000}
	offset={{ bottom: bottomBarOpen ? TOAST_ABOVE_BOTTOM_BAR : TOAST_GAP }}
	mobileOffset={{
		bottom: `calc(${bottomBarOpen ? TOAST_ABOVE_BOTTOM_BAR : MOBILE_TOAST_GAP}px + env(safe-area-inset-bottom, 0px))`
	}}
/>
<PersistQueryClientProvider client={queryClient} {persistOptions}>
	<Tooltip.Provider delayDuration={300}>
		<AppShell>{@render children()}</AppShell>
		<ItemTransition />
	</Tooltip.Provider>
</PersistQueryClientProvider>
