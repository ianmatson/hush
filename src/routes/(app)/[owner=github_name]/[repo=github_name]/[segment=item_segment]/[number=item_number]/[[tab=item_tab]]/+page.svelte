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

	let cameFromApp = false;
	afterNavigate(({ from }) => {
		cameFromApp = !!from;
	});

	function back() {
		if (cameFromApp) history.back();
		else goto(`/inbox?${PEEK_PARAM}=${peekLinkParam({ repo, number })}`);
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

<div class={cn('mx-auto pb-20', onFilesTab ? 'max-w-[100rem]' : 'max-w-4xl')}>
	<div
		class="sticky top-12 z-10 flex h-11 items-center gap-1 border-b bg-background/85 px-2 backdrop-blur"
	>
		<Button variant="ghost" size="sm" onclick={back}><ArrowLeft />Back</Button>
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
		<span class="hidden px-2 text-xs text-muted-foreground lg:inline"
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
	{#if onFilesTab && pr}
		<PullFiles
			{repo}
			{number}
			pullRequestId={q.data?.can.id ?? ''}
			head={q.data?.can.pr?.headOid ?? ''}
			lastReview={pr.lastReview ?? null}
			canComment={!!q.data?.can.comment}
			isAuthor={!!q.data?.can.author}
			changedFiles={pr.files}
			additions={pr.additions}
			deletions={pr.deletions}
		/>
	{:else if !onFilesTab}
		<PeekContent {repo} {number} title={itemTitle} showFiles={false} />
	{/if}
</div>

<div class="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
	<div
		class={cn(
			'mx-auto flex flex-wrap items-center gap-1 p-2',
			onFilesTab ? 'max-w-[100rem]' : 'max-w-4xl'
		)}
	>
		<GhActions {repo} {number} need={null} />
	</div>
</div>
