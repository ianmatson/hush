<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { meQuery, peekQuery } from '$lib/queries';
	import { noteOpened } from '$lib/recheck';
	import { clearNotificationsFor } from '$lib/notification-clear';
	import { FILES_TAB, ITEM_PATH_SEGMENTS, itemPagePath } from '$lib/shared/item-page';
	import { PEEK_PARAM, peekLinkParam } from '$lib/shared/peek-link';
	import { subjectKey } from '$lib/shared/subject';
	import { Button } from '$lib/components/ui/button';
	import PeekContent from '$lib/components/app/peek-content.svelte';
	import GhActions from '$lib/components/app/gh-actions.svelte';
	import PullFiles from '$lib/components/app/pull-files.svelte';
	import { cn } from '$lib/utils';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Tip from '$lib/components/app/tip.svelte';

	const SEEN_AFTER_MS = 1500;

	const repo = $derived(`${page.params.owner}/${page.params.repo}`);
	const number = $derived(Number(page.params.number));
	const itemKey = $derived(subjectKey(repo, number));

	const q = createQuery(() => peekQuery(repo, number));
	const me = createQuery(meQuery);

	const pr = $derived(q.data?.kind === 'pr' ? q.data.pr : undefined);
	const onFilesTab = $derived(page.params.tab === FILES_TAB && q.data?.kind !== 'issue');
	const itemTitle = $derived(q.data?.title ?? `${repo}#${number}`);
	const title = $derived(onFilesTab ? `Files · ${itemTitle}` : itemTitle);
	const itemUrl = $derived(
		q.data?.url ?? `https://github.com/${repo}/${page.params.segment}/${number}`
	);
	const githubUrl = $derived(onFilesTab ? `${itemUrl}/${FILES_TAB}` : itemUrl);
	const kind = $derived(
		q.data?.kind ?? (page.params.segment === ITEM_PATH_SEGMENTS.pr ? 'pr' : 'issue')
	);
	const conversationPath = $derived(itemPagePath(repo, number, kind));
	const filesPath = $derived(`${conversationPath}/${FILES_TAB}`);

	function showTab(files: boolean) {
		if (kind !== 'pr' || files === onFilesTab) return;
		goto(files ? filesPath : conversationPath, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	const SVELTEKIT_HISTORY_INDEX = 'sveltekit:history';

	function historyIndex(): number | null {
		const index = history.state?.[SVELTEKIT_HISTORY_INDEX];
		return typeof index === 'number' ? index : null;
	}

	let listHistoryIndex: number | null = null;
	afterNavigate(({ from }) => {
		if (from?.route.id === page.route.id) return;
		const here = historyIndex();
		listHistoryIndex = from && here !== null ? here - 1 : null;
	});

	function back() {
		const here = historyIndex();
		if (listHistoryIndex !== null && here !== null && here > listHistoryIndex)
			history.go(listHistoryIndex - here);
		else goto(`/v?${PEEK_PARAM}=${peekLinkParam({ repo, number })}`);
	}

	$effect(() => {
		const loadedKind = q.data?.kind;
		if (!loadedKind) return;
		const wrongSegment = ITEM_PATH_SEGMENTS[loadedKind] !== page.params.segment;
		const filesOnIssue = loadedKind === 'issue' && page.params.tab === FILES_TAB;
		if (!wrongSegment && !filesOnIssue) return;
		const path = itemPagePath(repo, number, loadedKind);
		replaceState(onFilesTab ? `${path}/${FILES_TAB}${page.url.hash}` : path, page.state);
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
		const cmd = commandFor(e, ['list', 'page']);
		const run: Record<string, () => void> = {
			'page.conversation': () => showTab(false),
			'page.files': () => showTab(true),
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

<div
	data-item-page
	data-wide-page={onFilesTab ? '' : undefined}
	class="mx-auto min-h-dvh max-w-[100rem] bg-background pb-24"
>
	{#if onFilesTab && pr}
		<PullFiles
			{repo}
			{number}
			pullRequestId={q.data?.can.id ?? ''}
			head={q.data?.can.pr?.headOid ?? ''}
			lastReview={pr.lastReview ?? null}
			canComment={!!q.data?.can.comment}
			isAuthor={!!q.data?.can.author}
			permission={q.data?.can.permission ?? null}
			changedFiles={pr.files}
			additions={pr.additions}
			deletions={pr.deletions}
		/>
	{:else if !onFilesTab}
		<div class="mx-auto max-w-4xl">
			<PeekContent {repo} {number} title={itemTitle} showFiles={false} />
		</div>
	{/if}
</div>

<div
	class="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-2 sm:px-4"
	data-item-dock
>
	<div
		class="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-popover/95 p-1 text-sm shadow-lg backdrop-blur sm:gap-1 sm:p-1.5"
	>
		<Tip text="Back ({keysOf('list.escape')[0] ?? ''})">
			{#snippet children(props)}
				<Button {...props} variant="ghost" size="sm" onclick={back} aria-label="Back"
					><ArrowLeft /><span class="hidden sm:inline">Back</span></Button
				>
			{/snippet}
		</Tip>
		<span class="mx-1 h-5 w-px bg-border"></span>
		{#if kind === 'pr'}
			<nav aria-label="Pull request" class="flex items-center gap-1 text-sm">
				<a
					href={conversationPath}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={onFilesTab ? undefined : 'page'}
					class={cn(
						'rounded-md px-2 py-1 text-muted-foreground hover:text-foreground',
						!onFilesTab && 'bg-muted text-foreground'
					)}>Conversation</a
				>
				<a
					href={filesPath}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={onFilesTab ? 'page' : undefined}
					class={cn(
						'flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground',
						onFilesTab && 'bg-muted text-foreground'
					)}
					>Files{#if pr}<span class="text-xs text-muted-foreground tabular-nums">{pr.files}</span
						>{/if}</a
				>
			</nav>
		{/if}
		<span class="mx-1 h-5 w-px bg-border"></span>
		<GhActions {repo} {number} need={null} />
		<Button
			variant="ghost"
			size="icon-sm"
			href={githubUrl}
			onclick={() => noteOpened(githubUrl)}
			target="_blank"
			rel="noreferrer"
			aria-label="Open on GitHub"><ExternalLink /></Button
		>
	</div>
</div>
