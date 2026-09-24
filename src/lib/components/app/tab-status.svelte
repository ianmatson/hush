<script lang="ts">
	import { onMount } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { dashQuery, threadsQuery } from '$lib/queries';
	import {
		DOT_COLORS,
		faviconHref,
		loadPrefs,
		titlePrefix,
		total,
		withPrefix,
		type Counts
	} from '$lib/tab-status';
	import type { DashResponse } from '$lib/shared/types';

	// Same queries as the header badges, so this adds no requests.
	const inbox = createQuery(() => threadsQuery('action'));
	const prs = createQuery(() => dashQuery('pr'));
	const issues = createQuery(() => dashQuery('issue'));

	const turns = (d: DashResponse | undefined, turn: 'you' | 'team') =>
		d?.items.filter((i) => i.turn === turn && !i.dismissed).length ?? 0;

	const counts = $derived<Counts>({
		inbox: inbox.data?.counts.action ?? 0,
		inboxFyi: inbox.data?.counts.fyi ?? 0,
		prYou: turns(prs.data, 'you'),
		prTeam: turns(prs.data, 'team'),
		issueYou: turns(issues.data, 'you')
	});

	let prefs = $state(loadPrefs());
	const prefix = $derived(titlePrefix(counts, prefs.title));
	const dot = $derived(
		prefs.favicon.enabled && total(counts, prefs.favicon.sources) > 0
			? DOT_COLORS[prefs.favicon.color]
			: null
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
		const href = faviconHref(dot);
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
