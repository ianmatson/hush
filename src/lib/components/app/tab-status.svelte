<script lang="ts">
	import { onMount } from 'svelte';
	import { createTabCounts } from '$lib/tab-counts.svelte';
	import { faviconHref, loadPrefs, TAB_STATUS_KEY, tabStatusOf, withPrefix } from '$lib/tab-status';

	const tabCounts = createTabCounts();

	let prefs = $state(loadPrefs());
	const status = $derived(tabStatusOf(tabCounts.current, prefs));
	const prefix = $derived(status.titlePrefix);
	const dot = $derived(status.dot);
	const dotCount = $derived(status.dotCount);
	const badge = $derived(status.badge);

	let icon = $state<HTMLLinkElement | null>(null);
	let originalIcon = '';

	function applyTitle() {
		const next = withPrefix(document.title, prefix);
		if (next !== document.title) document.title = next;
	}

	$effect(() => {
		void prefix;
		applyTitle();
	});

	$effect(() => {
		// Read `dot` before the null check, so the effect always tracks it.
		const href = faviconHref(dot, dotCount);
		if (icon) icon.href = href;
	});

	$effect(() => {
		const nav = navigator as Navigator & {
			setAppBadge?: (n?: number) => Promise<void>;
			clearAppBadge?: () => Promise<void>;
		};
		if (!nav.setAppBadge || !nav.clearAppBadge) return;
		(badge ? nav.setAppBadge(badge) : nav.clearAppBadge()).catch(() => {});
	});

	onMount(() => {
		icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
		originalIcon = icon?.href ?? '';

		// Pages set their own <title>; put the prefix back each time.
		const observer = new MutationObserver(applyTitle);
		observer.observe(document.head, { subtree: true, childList: true, characterData: true });

		// Settings changes, in this tab or another one.
		const reload = () => (prefs = loadPrefs());
		const onStorage = (e: StorageEvent) => e.key === TAB_STATUS_KEY && reload();
		window.addEventListener(TAB_STATUS_KEY, reload);
		window.addEventListener('storage', onStorage);

		return () => {
			observer.disconnect();
			window.removeEventListener(TAB_STATUS_KEY, reload);
			window.removeEventListener('storage', onStorage);
			document.title = withPrefix(document.title, '');
			if (icon) icon.href = originalIcon;
			(navigator as Navigator & { clearAppBadge?: () => Promise<void> })
				.clearAppBadge?.()
				.catch(() => {});
		};
	});
</script>
