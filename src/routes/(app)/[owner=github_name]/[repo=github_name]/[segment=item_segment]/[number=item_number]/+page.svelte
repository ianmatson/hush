<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { meQuery, peekQuery } from '$lib/queries';
	import { noteOpened } from '$lib/recheck';
	import { clearNotificationsFor } from '$lib/notification-clear';
	import { ITEM_PATH_SEGMENTS, itemPagePath } from '$lib/shared/item-page';
	import { PEEK_PARAM, peekLinkParam } from '$lib/shared/peek-link';
	import { subjectKey } from '$lib/shared/subject';
	import { Button } from '$lib/components/ui/button';
	import PeekContent from '$lib/components/app/peek-content.svelte';
	import GhActions from '$lib/components/app/gh-actions.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	const SEEN_AFTER_MS = 1500;

	const repo = $derived(`${page.params.owner}/${page.params.repo}`);
	const number = $derived(Number(page.params.number));
	const itemKey = $derived(subjectKey(repo, number));

	const q = createQuery(() => peekQuery(repo, number));
	const me = createQuery(meQuery);

	const title = $derived(q.data?.title ?? `${repo}#${number}`);
	const githubUrl = $derived(
		q.data?.url ?? `https://github.com/${repo}/${page.params.segment}/${number}`
	);

	let cameFromApp = false;
	afterNavigate(({ from }) => {
		cameFromApp = !!from;
	});

	function back() {
		if (cameFromApp) history.back();
		else goto(`/inbox?${PEEK_PARAM}=${peekLinkParam({ repo, number })}`);
	}

	$effect(() => {
		const kind = q.data?.kind;
		if (!kind || ITEM_PATH_SEGMENTS[kind] === page.params.segment) return;
		replaceState(itemPagePath(repo, number, kind), page.state);
	});

	$effect(() => {
		const key = itemKey;
		const timer = setTimeout(() => api.seen([key]).catch(() => {}), SEEN_AFTER_MS);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (me.data?.settings.clearNotifications === 'item') clearNotificationsFor(itemKey);
	});

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const cmd = commandFor(e, ['list']);
		const run: Record<string, () => void> = {
			'list.escape': back,
			'list.fullPage': back,
			'list.openGitHub': () => {
				window.open(githubUrl, '_blank', 'noopener');
				noteOpened(githubUrl);
			}
		};
		const fn = cmd ? run[cmd] : undefined;
		if (!fn) return;
		e.preventDefault();
		fn();
	}
</script>

<svelte:head><title>{title} · Hush</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="mx-auto max-w-4xl pb-20">
	<div
		class="sticky top-12 z-10 flex h-11 items-center gap-1 border-b bg-background/85 px-2 backdrop-blur"
	>
		<Button variant="ghost" size="sm" onclick={back}><ArrowLeft />Back</Button>
		<span class="hidden px-2 text-xs text-muted-foreground sm:inline"
			><kbd class="font-sans">{keysOf('list.escape')[0] ?? ''}</kbd> to go back</span
		>
		<Button
			class="ml-auto"
			variant="ghost"
			size="icon-sm"
			href={githubUrl}
			onclick={() => noteOpened(githubUrl)}
			target="_blank"
			rel="noreferrer"
			aria-label="Open on GitHub"><ExternalLink /></Button
		>
	</div>
	<PeekContent {repo} {number} {title} />
</div>

<div class="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
	<div class="mx-auto flex max-w-4xl flex-wrap items-center gap-1 p-2">
		<GhActions {repo} {number} need={null} />
	</div>
</div>
