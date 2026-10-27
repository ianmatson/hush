<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { commandFor, ignoreKey, keysOf } from '$lib/keys.svelte';
	import { itemsQuery, meQuery, peekQuery } from '$lib/queries';
	import { noteOpened } from '$lib/recheck';
	import { clearNotificationsFor } from '$lib/notification-clear';
	import { itemCommands, type ItemActionContext } from '$lib/dash-actions';
	import { composer, focusComposer } from '$lib/gh-act.svelte';
	import {
		UNTIL_NEW_ACTIVITY,
		copyLinks,
		markItemsSeen,
		setItemsRead,
		snoozeItems,
		toggleMuteItems,
		unsnoozeItems
	} from '$lib/item-actions';
	import { palette } from '$lib/palette.svelte';
	import { START_PAGE_KEY, startPath } from '$lib/start-page';
	import { ui } from '$lib/ui.svelte';
	import { shortcutsFor, shortcutsOf, type Shortcut } from '$lib/shortcuts';
	import type { KeyScope } from '$lib/shared/keymap';
	import type { DashItem } from '$lib/shared/types';
	import {
		FILES_TAB,
		ITEM_PATH_SEGMENTS,
		githubItemUrl,
		itemPagePath,
		kindOfItemSegment
	} from '$lib/shared/item-page';
	import { subjectKey } from '$lib/shared/subject';
	import { findStacks, stackByMember, type StackMember } from '$lib/shared/stacks';
	import { Button } from '$lib/components/ui/button';
	import PeekContent from '$lib/components/app/peek-content.svelte';
	import GhActions from '$lib/components/app/gh-actions.svelte';
	import PullFiles from '$lib/components/app/pull-files.svelte';
	import ShortcutsDialog from '$lib/components/app/shortcuts-dialog.svelte';
	import SnoozeButton from '$lib/components/app/snooze-button.svelte';
	import { alreadyTrue } from '$lib/shared/snooze';
	import { cn } from '$lib/utils';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Tip from '$lib/components/app/tip.svelte';
	import ScrollToBottom from '$lib/components/app/scroll-to-bottom.svelte';
	import StackStrip from '$lib/components/app/stack-strip.svelte';
	import ItemWhyLine from '$lib/components/app/item-why-line.svelte';
	import { changesSinceOpening } from '$lib/changes-since-opening.svelte';

	const SEEN_AFTER_MS = 1500;
	const PAGE_KEY_SCOPES: KeyScope[] = ['list', 'item', 'page'];

	const repo = $derived(`${page.params.owner}/${page.params.repo}`);
	const number = $derived(Number(page.params.number));
	const itemKey = $derived(subjectKey(repo, number));

	const q = createQuery(() => peekQuery(repo, number));
	const me = createQuery(meQuery);

	const pr = $derived(q.data?.kind === 'pr' ? q.data.pr : undefined);
	const onFilesTab = $derived(page.params.tab === FILES_TAB && q.data?.kind !== 'issue');
	const itemTitle = $derived(q.data?.title ?? `${repo}#${number}`);
	const title = $derived(onFilesTab ? `Files · ${itemTitle}` : itemTitle);
	const kind = $derived(q.data?.kind ?? kindOfItemSegment(page.params.segment) ?? 'issue');
	const itemUrl = $derived(q.data?.url ?? githubItemUrl(repo, number, kind));
	const githubUrl = $derived(onFilesTab ? `${itemUrl}/${FILES_TAB}` : itemUrl);
	const conversationPath = $derived(itemPagePath(repo, number, kind));
	const filesPath = $derived(`${conversationPath}/${FILES_TAB}`);

	const items = createQuery(itemsQuery);
	const dashItem = $derived(items.data?.rows.find((i) => i.id === itemKey));
	const stack = $derived(
		stackByMember(findStacks(items.data?.rows.filter((i) => i.kind === 'pr') ?? [])).get(itemKey)
	);
	const viewNameOf = (i: DashItem) =>
		me.data?.settings.views.find((v) => i.views.includes(v.id))?.name ?? 'In your views';
	const whyLead = (i: DashItem) => (i.muted ? 'Muted' : i.dismissed ? 'Snoozed' : viewNameOf(i));
	const changes = changesSinceOpening(() => dashItem);
	let helpOpen = $state(false);
	let pageContent = $state<HTMLElement | null>(null);

	$effect(() => {
		ui.itemDockOpen = true;
		return () => (ui.itemDockOpen = false);
	});

	function showTab(files: boolean) {
		if (kind !== 'pr' || files === onFilesTab) return;
		return goto(files ? filesPath : conversationPath, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function openStackMember(m: StackMember) {
		const path = itemPagePath(m.repo, m.number, 'pr');
		return goto(onFilesTab ? `${path}/${FILES_TAB}` : path, { replaceState: true });
	}

	function stepStack(direction: 1 | -1) {
		if (!stack) return;
		const at = stack.membersBottomFirst.findIndex((m) => m.key === itemKey);
		const next = stack.membersBottomFirst[at + direction];
		if (next) openStackMember(next);
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
		listHistoryIndex = from?.url && here !== null ? here - 1 : null;
	});

	function startListPath() {
		const views = me.data?.settings.views;
		return views?.length ? startPath(views, localStorage.getItem(START_PAGE_KEY)) : '/v';
	}

	function back() {
		const here = historyIndex();
		if (listHistoryIndex !== null && here !== null && here > listHistoryIndex)
			history.go(listHistoryIndex - here);
		else goto(startListPath());
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

	async function focusComposerOnConversationTab() {
		await showTab(false);
		await tick();
		focusComposer(composer.intent);
	}

	let composerRequestsSeen = composer.focus;
	$effect(() => {
		const requests = composer.focus;
		if (requests === composerRequestsSeen) return;
		composerRequestsSeen = requests;
		untrack(() => {
			if (onFilesTab) focusComposerOnConversationTab();
		});
	});

	const isPageVisible = () => document.visibilityState === 'visible';
	let pageVisible = $state(isPageVisible());
	const itemLoaded = $derived(!!q.data);
	let seenSettledFor: string | null = null;
	let seenTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const key = itemKey;
		if (!itemLoaded || !pageVisible || seenSettledFor === key) return;
		seenTimer = setTimeout(() => {
			seenSettledFor = key;
			markItemsSeen([key]);
		}, SEEN_AFTER_MS);
		return () => clearTimeout(seenTimer);
	});

	$effect(() => {
		if (me.data?.settings.clearNotifications === 'item') clearNotificationsFor(itemKey);
	});

	function setReadHere(ids: string[], read: boolean) {
		clearTimeout(seenTimer);
		seenSettledFor = itemKey;
		return setItemsRead(ids, read);
	}

	const itemActions: ItemActionContext = {
		byId: (id) => (id === dashItem?.id ? dashItem : undefined),
		snooze: snoozeItems,
		unsnooze: unsnoozeItems,
		toggleMute: toggleMuteItems,
		setRead: setReadHere,
		copyLinks: () => copyLinks([githubUrl])
	};

	$effect(() =>
		palette.register(() =>
			itemCommands(itemActions, [itemKey], {
				snoozed: !!dashItem?.dismissed,
				detail: `${repo}#${number}`,
				keyScopes: PAGE_KEY_SCOPES
			})
		)
	);

	function ifInYourViews(act: (item: DashItem) => unknown) {
		return () => {
			if (dashItem) act(dashItem);
			else
				toast('Not in your views', {
					description: 'Snooze, mute, and unread work only for items in your views.'
				});
		};
	}

	const helpShortcuts = $derived<Shortcut[]>([
		...shortcutsFor(['global']),
		[[...keysOf('list.escape'), ...keysOf('list.fullPage')].join(' / '), 'Back'],
		...shortcutsOf(['list.openGitHub', 'list.search', 'list.help']),
		...shortcutsFor(kind === 'pr' ? ['item', 'peek', 'page'] : ['item', 'peek'])
	]);

	function onKey(e: KeyboardEvent) {
		if (ignoreKey(e)) return;
		const cmd = commandFor(e, PAGE_KEY_SCOPES);
		const run: Record<string, () => void> = {
			'page.conversation': () => showTab(false),
			'page.files': () => showTab(true),
			'list.escape': back,
			'list.fullPage': back,
			'list.openGitHub': () => {
				window.open(githubUrl, '_blank', 'noopener');
				noteOpened(githubUrl);
			},
			'list.search': () => (palette.open = true),
			'list.help': () => (helpOpen = true),
			'list.copy': () => itemActions.copyLinks([itemKey]),
			'dash.stackUp': () => stepStack(1),
			'dash.stackDown': () => stepStack(-1),
			'dash.snooze': ifInYourViews((i) =>
				i.dismissed ? itemActions.unsnooze([i.id]) : itemActions.snooze([i.id], UNTIL_NEW_ACTIVITY)
			),
			'dash.mute': ifInYourViews((i) => itemActions.toggleMute([i.id])),
			'dash.read': ifInYourViews((i) => itemActions.setRead([i.id], !!i.unread))
		};
		const fn = cmd ? run[cmd] : undefined;
		if (!fn) return;
		e.preventDefault();
		fn();
	}
</script>

<svelte:head><title>{title} · Hush</title></svelte:head>
<svelte:window onkeydown={onKey} />
<svelte:document onvisibilitychange={() => (pageVisible = isPageVisible())} />

<div
	bind:this={pageContent}
	data-item-page
	data-wide-page={onFilesTab ? '' : undefined}
	data-item-ready={onFilesTab && pr ? itemKey : undefined}
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
		{#if stack || dashItem}
			<div class="border-b bg-muted/40">
				<div class="mx-auto max-w-4xl [&>*]:border-b-0">
					{#if stack}
						<StackStrip
							{stack}
							currentKey={itemKey}
							outsideLabel="not in your views"
							onpick={openStackMember}
						/>
					{/if}
					{#if dashItem}
						<ItemWhyLine item={dashItem} lead={whyLead(dashItem)} shown={changes.current} />
					{/if}
				</div>
			</div>
		{/if}
		<div class="mx-auto max-w-4xl">
			<PeekContent {repo} {number} title={itemTitle} showFiles={false} />
		</div>
	{/if}
	<div
		class={cn(
			'sticky bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.5rem)] mx-auto h-0 lg:bottom-[max(1rem,env(safe-area-inset-bottom))]',
			!onFilesTab && 'max-w-4xl'
		)}
	>
		<ScrollToBottom scroller={window} content={pageContent} class="absolute right-4 bottom-0" />
	</div>
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
			<span class="mx-1 h-5 w-px bg-border"></span>
		{/if}
		{#if dashItem}
			{@const i = dashItem}
			<SnoozeButton
				snoozed={!!i.dismissed}
				subjects={[i.kind]}
				disabled={alreadyTrue(i)}
				iconOnly
				onpick={(choice) => itemActions.snooze([i.id], choice)}
				onwake={() => itemActions.unsnooze([i.id])}
			/>
		{/if}
		<Button
			variant="ghost"
			size="icon-sm"
			href={githubUrl}
			onclick={() => noteOpened(githubUrl)}
			target="_blank"
			rel="noreferrer"
			aria-label="Open on GitHub"><ExternalLink /></Button
		>
		<GhActions {repo} {number} need={null} moreAsIcon />
	</div>
</div>

<ShortcutsDialog bind:open={helpOpen} shortcuts={helpShortcuts} />
