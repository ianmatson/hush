<script lang="ts">
	import { onMount } from 'svelte';
	import { createTabCounts } from '$lib/tab-counts.svelte';
	import {
		DOT_COLORS,
		faviconHref,
		loadPrefs,
		titlePrefix,
		total,
		withPrefix
	} from '$lib/tab-status';

	const tabCounts = createTabCounts();
	const counts = $derived(tabCounts.current);

	let prefs = $state(loadPrefs());
	const prefix = $derived(titlePrefix(counts, prefs.title));
	const dot = $derived(
		prefs.favicon.enabled && total(counts, prefs.favicon.sources) > 0
			? DOT_COLORS[prefs.favicon.color]
			: null
	);
	const dotCount = $derived(
		prefs.favicon.style === 'count' ? total(counts, prefs.favicon.sources) : undefined
	);
	const badge = $derived(prefs.appBadge.enabled ? total(counts, prefs.appBadge.sources) : 0);

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
		const onStorage = (e: StorageEvent) => e.key === 'hush:tab-status' && reload();
		window.addEventListener('hush:tab-status', reload);
		window.addEventListener('storage', onStorage);

		return () => {
			observer.disconnect();
			window.removeEventListener('hush:tab-status', reload);
			window.removeEventListener('storage', onStorage);
			document.title = withPrefix(document.title, '');
			if (icon) icon.href = originalIcon;
			(navigator as Navigator & { clearAppBadge?: () => Promise<void> })
				.clearAppBadge?.()
				.catch(() => {});
		};
	});
</script>
