<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { flip } from 'svelte/animate';
	import { fly, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api, type ThreadAction } from '$lib/api';
	import { keys, meQuery, queryClient, setCounts, threadsQuery } from '$lib/queries';
	import { Selection } from '$lib/selection.svelte';
	import type { Counts, ThreadDTO, View } from '$lib/shared/types';
	import { ago, snoozeOptions } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Kbd } from '$lib/components/ui/kbd';
	import ThreadRow from '$lib/components/app/thread-row.svelte';
	import BulkBar from '$lib/components/app/bulk-bar.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Link from '@lucide/svelte/icons/link';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Mail from '@lucide/svelte/icons/mail';
	import SquareCheck from '@lucide/svelte/icons/square-check';

	type ThreadsData = { threads: ThreadDTO[]; counts: Counts };

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'action', label: 'Needs you' },
		{ id: 'fyi', label: 'FYI' },
		{ id: 'snoozed', label: 'Snoozed' },
		{ id: 'done', label: 'Done' },
		{ id: 'muted', label: 'Muted' }
	];
	const BULK_MAX = 20;
	const FLIP = { duration: 220, easing: cubicOut };

	const view = $derived((page.url.searchParams.get('view') as View) || 'action');
	const inInbox = $derived(view === 'action' || view === 'fyi');
	const me = createQuery(meQuery);
	const threadsQ = createQuery(() => threadsQuery(view));
	const counts = $derived(threadsQ.data?.counts ?? { action: 0, fyi: 0, snoozed: 0 });

	let syncing = $state(false);
	let query = $state('');
	let selectedId = $state<string | null>(null);
	let helpOpen = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);
	// Threads with a triage request in flight. A refetch must not bring them back.
	const pending = new SvelteSet<string>();
	const sel = new Selection();

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = (threadsQ.data?.threads ?? []).filter((t) => !pending.has(t.id));
		if (!q) return list;
		return list.filter((t) =>
			`${t.summary} ${t.title} ${t.repo} ${t.why} ${t.author ?? ''}`.toLowerCase().includes(q)
		);
	});
	const order = $derived(visible.map((t) => t.id));
	const selectedIndex = $derived(visible.findIndex((t) => t.id === selectedId));
	const byId = (id: string) => visible.find((t) => t.id === id);

	// Keep a valid cursor and selection when the list changes.
	$effect(() => {
		if (!visible.some((t) => t.id === selectedId)) selectedId = visible[0]?.id ?? null;
		untrack(() => sel.prune(order));
	});
	// A new view starts with nothing selected.
	$effect(() => {
		void view;
		untrack(() => sel.clear());
	});

	async function sync() {
		syncing = true;
		try {
			const status = await api.sync();
			if (status.lastError) toast.error(status.lastError);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: keys.threadsAll }),
				queryClient.invalidateQueries({ queryKey: keys.me })
			]);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			syncing = false;
		}
	}

	const UNDO: Partial<Record<ThreadAction, ThreadAction>> = {
		done: 'undone',
		snooze: 'unsnooze',
		mute: 'unmute'
	};
	const LABEL: Partial<Record<ThreadAction, string>> = {
		done: 'Marked as done',
		snooze: 'Snoozed',
		mute: 'Muted. GitHub stops notifying you about these threads.',
		undone: 'Moved to inbox',
		unsnooze: 'Moved to inbox',
		unmute: 'Unmuted',
		read: 'Marked as read',
		unread: 'Marked as unread'
	};

	/** Send an action for many threads, 20 per request. */
	async function run(ids: string[], action: ThreadAction, body?: unknown) {
		for (let i = 0; i < ids.length; i += BULK_MAX) {
			const res = await api.actMany(ids.slice(i, i + BULK_MAX), action, body);
			setCounts(res.counts);
		}
		// Other views changed too; refetch them when they are next used.
		queryClient.invalidateQueries({ queryKey: keys.threadsAll });
	}

	async function act(ids: string[], action: ThreadAction, body?: unknown) {
		if (!ids.length) return;
		const threads = ids.map(byId).filter((t): t is ThreadDTO => !!t);
		if (action === 'read' || action === 'unread') {
			// Stays in the list; only the marker changes.
			const unread = action === 'unread';
			queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
				old
					? {
							...old,
							threads: old.threads.map((x) => (ids.includes(x.id) ? { ...x, unread } : x))
						}
					: old
			);
			run(ids, action).catch((e) => toast.error(e.message));
			if (ids.length > 1) toast(LABEL[action]!, { description: `${ids.length} threads` });
			return;
		}
		// Optimistic: the rows leave this view now. Stop any refetch that could bring them back.
		const gone = new Set(ids);
		const after = visible.slice(Math.max(0, selectedIndex)).find((t) => !gone.has(t.id));
		const before = [...visible.slice(0, Math.max(0, selectedIndex))]
			.reverse()
			.find((t) => !gone.has(t.id));
		if (selectedId && gone.has(selectedId)) selectedId = (after ?? before)?.id ?? null;
		for (const id of ids) pending.add(id);
		sel.clear();
		await queryClient.cancelQueries({ queryKey: keys.threads(view) });
		queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
			old ? { ...old, threads: old.threads.filter((x) => !gone.has(x.id)) } : old
		);
		try {
			await run(ids, action, body);
			const undo = UNDO[action];
			toast(LABEL[action] ?? 'Done', {
				description: threads.length === 1 ? threads[0].title : `${threads.length} threads`,
				action: undo
					? { label: 'Undo', onClick: () => run(ids, undo).catch((e) => toast.error(e.message)) }
					: undefined
			});
		} catch (err) {
			toast.error((err as Error).message);
			queryClient.invalidateQueries({ queryKey: keys.threads(view) });
		} finally {
			for (const id of ids) pending.delete(id);
		}
	}

	/** Rows an action applies to: the selection, or else the cursor row. */
	const targets = () => sel.targets(order, selectedId);

	/**
	 * Read/unread toggle (like Gmail): if any of the threads is unread, mark them all read;
	 * otherwise mark them all unread.
	 */
	const readAction = (ids: string[]): 'read' | 'unread' =>
		ids.some((id) => byId(id)?.unread) ? 'read' : 'unread';
	const toggleRead = (ids: string[]) => ids.length && act(ids, readAction(ids));

	function open(t: ThreadDTO, url: string) {
		window.open(url, '_blank', 'noopener');
		if (t.unread) act([t.id], 'read');
	}

	async function copyLinks(ids: string[]) {
		const urls = ids
			.map(byId)
			.filter(Boolean)
			.map((t) => t!.htmlUrl);
		await navigator.clipboard.writeText(urls.join('\n'));
		toast.success(urls.length === 1 ? 'Link copied' : `${urls.length} links copied`);
	}

	function onRowClick(e: MouseEvent, t: ThreadDTO) {
		if (sel.click(e, t.id, order, selectedId)) return;
		sel.clear();
		selectedId = t.id;
	}

	function onToggle(e: MouseEvent, t: ThreadDTO) {
		if (e.shiftKey) sel.range(order, t.id, selectedId);
		else sel.toggle(t.id);
		selectedId = t.id;
	}

	function move(delta: number, extend = false) {
		if (!visible.length) return;
		if (extend && selectedId) sel.ids.add(selectedId);
		const i =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), visible.length - 1);
		selectedId = visible[i].id;
		if (extend) sel.ids.add(selectedId);
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
			e.preventDefault();
			sel.all(order);
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const t = visible[selectedIndex];
		const keys: Record<string, () => void> = {
			j: () => move(1),
			ArrowDown: () => move(1),
			k: () => move(-1),
			ArrowUp: () => move(-1),
			J: () => move(1, true),
			K: () => move(-1, true),
			x: () => t && sel.toggle(t.id),
			Escape: () => sel.clear(),
			o: () => t && open(t, t.actionUrl),
			Enter: () => t && open(t, t.actionUrl),
			O: () => t && open(t, t.htmlUrl),
			e: () => inInbox && act(targets(), 'done'),
			s: () => inInbox && act(targets(), 'snooze', { until: snoozeOptions()[2].until }),
			m: () => inInbox && act(targets(), 'mute'),
			c: () => copyLinks(targets()),
			u: () => toggleRead(targets()),
			r: () => sync(),
			'/': () => searchEl?.focus(),
			'?': () => (helpOpen = true)
		};
		VIEWS.forEach((v, i) => (keys[String(i + 1)] = () => goto(`/?view=${v.id}`)));
		const fn = keys[e.key];
		if (fn) {
			e.preventDefault();
			fn();
		}
	}

	// --- Right-click menu: one menu for the whole list --------------------------------
	let menuIds = $state<string[]>([]);
	function onContextMenu(e: MouseEvent) {
		const id = (e.target as Element).closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
		if (!id) {
			e.preventDefault();
			return;
		}
		// Right-click inside the selection acts on all of it; elsewhere, on that row only.
		if (!sel.has(id)) {
			sel.clear();
			selectedId = id;
		}
		menuIds = sel.size ? sel.targets(order, id) : [id];
	}
	const menuOne = $derived(menuIds.length === 1 ? byId(menuIds[0]) : undefined);
	const n = (label: string) => (menuIds.length > 1 ? `${label} (${menuIds.length})` : label);
	const restoreAction = (t: ThreadDTO | undefined): ThreadAction =>
		view === 'muted' || t?.category === 'muted'
			? 'unmute'
			: view === 'snoozed'
				? 'unsnooze'
				: 'undone';

	const count = (v: View) => (v === 'action' || v === 'fyi' || v === 'snoozed' ? counts[v] : null);

	const shortcuts = [
		['J / K', 'Next / previous'],
		['Shift + J / K', 'Extend the selection'],
		['X', 'Select or deselect'],
		['⌘ / Ctrl + A', 'Select all'],
		['⌘ / Ctrl + click', 'Add to selection'],
		['Shift + click', 'Select a range'],
		['Enter / O', 'Main action (review, fix CI, reply…)'],
		['Shift + O', 'Open the thread on GitHub'],
		['E', 'Done'],
		['S', 'Snooze until tomorrow 9:00'],
		['M', 'Mute the thread'],
		['U', 'Mark as read / unread'],
		['C', 'Copy link'],
		['Esc', 'Clear the selection'],
		['R', 'Sync with GitHub now'],
		['/', 'Search'],
		['1 – 5', 'Change view'],
		['?', 'Show shortcuts']
	];
</script>

<svelte:window onkeydown={onKey} />

<main class="mx-auto max-w-4xl px-4 pt-4 pb-24">
	{#if me.data?.lastPollError}
		<Alert.Root variant="destructive" class="mb-4">
			<Alert.Title>Hush cannot read your notifications</Alert.Title>
			<Alert.Description>
				{me.data.lastPollError}
				{#if /token/i.test(me.data.lastPollError)}<a class="underline" href="/login"
						>Sign in again</a
					>{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if me.data?.ssoHiddenOrgs}
		<Alert.Root class="mb-4">
			<Alert.Title
				>GitHub hides notifications from {me.data.ssoHiddenOrgs}
				{me.data.ssoHiddenOrgs === 1 ? 'org' : 'orgs'}</Alert.Title
			>
			<Alert.Description>
				These orgs use SAML single sign-on, and your token is not authorized for them. On
				github.com/settings/tokens, choose “Configure SSO” next to the token, or <a
					class="underline"
					href="/login">sign in with a different token</a
				>.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<nav
			class="flex w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 text-sm sm:w-auto"
			aria-label="Views"
		>
			{#each VIEWS as v (v.id)}
				{@const n = count(v.id)}
				<a
					href="/?view={v.id}"
					class={cn(
						'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
						view === v.id && 'bg-background text-foreground shadow-xs'
					)}
				>
					{v.label}
					{#if n}
						<span
							class={cn(
								'min-w-4.5 rounded-full px-1 text-center text-[0.7rem] tabular-nums',
								v.id === 'action' ? 'bg-primary text-primary-foreground' : 'bg-foreground/10'
							)}>{n}</span
						>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="relative min-w-0 flex-1 sm:ml-auto sm:w-56 sm:flex-none">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:ref={searchEl}
				bind:value={query}
				placeholder="Filter"
				class="h-8 pl-8"
				aria-label="Filter threads"
			/>
		</div>
		<Button variant="ghost" size="icon-sm" aria-label="Sync now" onclick={sync} disabled={syncing}>
			<RefreshCw class={cn(syncing && 'animate-spin')} />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			class="hidden sm:inline-flex"
			aria-label="Keyboard shortcuts"
			onclick={() => (helpOpen = true)}
		>
			<Keyboard />
		</Button>
	</div>

	<p class="mt-3 mb-2 px-1 text-xs text-muted-foreground">
		{#if me.data?.lastPollAt}Synced {ago(me.data.lastPollAt)}{:else}First sync in progress…{/if}
		{#if view === 'fyi'}· Activity you may want to know about, but that does not need you.{/if}
	</p>

	{#if threadsQ.isPending}
		<div class="grid gap-2">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="flex items-center gap-3 px-3 py-3">
					<Skeleton class="size-8 rounded-full" />
					<div class="grid flex-1 gap-2">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/2" />
					</div>
				</div>
			{/each}
		</div>
	{:else if visible.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
		>
			<CircleCheck class="mb-3 size-8 text-signal-merge" />
			{#if query}
				<p class="font-medium">No threads match “{query}”.</p>
			{:else if view === 'action'}
				<p class="font-medium">Nothing needs you right now.</p>
				<p class="mt-1 text-sm text-muted-foreground">
					{#if counts.fyi}There {counts.fyi === 1 ? 'is' : 'are'}
						<a class="underline" href="/?view=fyi"
							>{counts.fyi} FYI {counts.fyi === 1 ? 'item' : 'items'}</a
						>, if you want them.{:else}Hush tells you when that changes.{/if}
				</p>
			{:else}
				<p class="font-medium">This view is empty.</p>
			{/if}
		</div>
	{:else}
		<ContextMenu.Root>
			<ContextMenu.Trigger>
				{#snippet child({ props })}
					<ul
						{...props}
						class="grid grid-cols-[minmax(0,1fr)] gap-0.5"
						role="listbox"
						aria-multiselectable="true"
						aria-label="Threads"
						oncontextmenucapture={onContextMenu}
					>
						{#each visible as t (t.id)}
							<li
								animate:flip={FLIP}
								out:slide={{ duration: 200, easing: cubicOut }}
								in:fly={{ y: -8, duration: 200 }}
							>
								<ThreadRow
									thread={t}
									selected={t.id === selectedId}
									checked={sel.has(t.id)}
									selecting={sel.size > 0}
									onaction={(x, action, body) => act([x.id], action, body)}
									onopen={open}
									onrowclick={(e) => onRowClick(e, t)}
									ontoggle={(e) => onToggle(e, t)}
									oncopy={(x) => copyLinks([x.id])}
								/>
							</li>
						{/each}
					</ul>
				{/snippet}
			</ContextMenu.Trigger>
			<ContextMenu.Content class="w-60">
				{#if menuOne}
					<ContextMenu.Item onclick={() => open(menuOne, menuOne.actionUrl)}>
						<ExternalLink />{menuOne.actionLabel}<ContextMenu.Shortcut>↵</ContextMenu.Shortcut>
					</ContextMenu.Item>
					<ContextMenu.Item onclick={() => open(menuOne, menuOne.htmlUrl)}>
						<ExternalLink />Open on GitHub<ContextMenu.Shortcut>⇧O</ContextMenu.Shortcut>
					</ContextMenu.Item>
					<ContextMenu.Separator />
				{/if}
				{#if inInbox}
					<ContextMenu.Item onclick={() => act(menuIds, 'done')}>
						<Check />{n('Done')}<ContextMenu.Shortcut>E</ContextMenu.Shortcut>
					</ContextMenu.Item>
					<ContextMenu.Sub>
						<ContextMenu.SubTrigger><AlarmClock />{n('Snooze')}</ContextMenu.SubTrigger>
						<ContextMenu.SubContent>
							{#each snoozeOptions() as opt (opt.label)}
								<ContextMenu.Item onclick={() => act(menuIds, 'snooze', { until: opt.until })}
									>{opt.label}</ContextMenu.Item
								>
							{/each}
						</ContextMenu.SubContent>
					</ContextMenu.Sub>
					<ContextMenu.Item onclick={() => act(menuIds, 'mute')}>
						<BellOff />{n('Mute')}<ContextMenu.Shortcut>M</ContextMenu.Shortcut>
					</ContextMenu.Item>
				{:else}
					<ContextMenu.Item onclick={() => act(menuIds, restoreAction(menuOne))}>
						<Undo />{n(view === 'muted' ? 'Unmute' : 'Move to inbox')}
					</ContextMenu.Item>
				{/if}
				<ContextMenu.Item onclick={() => toggleRead(menuIds)}>
					{#if readAction(menuIds) === 'read'}<MailOpen />{n('Mark as read')}{:else}<Mail />{n(
							'Mark as unread'
						)}{/if}
					<ContextMenu.Shortcut>U</ContextMenu.Shortcut>
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => copyLinks(menuIds)}>
					<Link />{n(menuIds.length > 1 ? 'Copy links' : 'Copy link')}<ContextMenu.Shortcut
						>C</ContextMenu.Shortcut
					>
				</ContextMenu.Item>
				<ContextMenu.Separator />
				{#if menuOne}
					<ContextMenu.Item onclick={() => sel.toggle(menuOne.id)}>
						<SquareCheck />{sel.has(menuOne.id) ? 'Deselect' : 'Select'}<ContextMenu.Shortcut
							>X</ContextMenu.Shortcut
						>
					</ContextMenu.Item>
				{/if}
				<ContextMenu.Item onclick={() => sel.all(order)}>
					<SquareCheck />Select all<ContextMenu.Shortcut>⌘A</ContextMenu.Shortcut>
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</main>

<BulkBar count={sel.size} onclear={() => sel.clear()}>
	{#if inInbox}
		<Button variant="ghost" size="sm" aria-label="Done" onclick={() => act(targets(), 'done')}
			><Check /><span class="hidden sm:inline">Done</span></Button
		>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="sm" aria-label="Snooze"
						><AlarmClock /><span class="hidden sm:inline">Snooze</span></Button
					>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="center" side="top">
				{#each snoozeOptions() as opt (opt.label)}
					<DropdownMenu.Item onclick={() => act(targets(), 'snooze', { until: opt.until })}
						>{opt.label}</DropdownMenu.Item
					>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<Button variant="ghost" size="sm" aria-label="Mute" onclick={() => act(targets(), 'mute')}
			><BellOff /><span class="hidden sm:inline">Mute</span></Button
		>
	{:else}
		<Button variant="ghost" size="sm" onclick={() => act(targets(), restoreAction(undefined))}>
			<Undo />{view === 'muted' ? 'Unmute' : 'Move to inbox'}
		</Button>
	{/if}
	{@const bulkRead = readAction(targets())}
	<Button
		variant="ghost"
		size="sm"
		aria-label={bulkRead === 'read' ? 'Mark as read' : 'Mark as unread'}
		onclick={() => toggleRead(targets())}
	>
		{#if bulkRead === 'read'}<MailOpen /><span class="hidden sm:inline">Read</span>{:else}<Mail
			/><span class="hidden sm:inline">Unread</span>{/if}
	</Button>
</BulkBar>

<Dialog.Root bind:open={helpOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
		</Dialog.Header>
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			{#each shortcuts as [k, d] (k)}
				<dt><Kbd>{k}</Kbd></dt>
				<dd class="text-muted-foreground">{d}</dd>
			{/each}
		</dl>
	</Dialog.Content>
</Dialog.Root>
