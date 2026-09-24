<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api, type ThreadAction } from '$lib/api';
	import { keys, meQuery, queryClient, setCounts, threadsQuery } from '$lib/queries';
	import type { Counts, ThreadDTO, View } from '$lib/shared/types';
	import { ago, snoozeOptions } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Kbd } from '$lib/components/ui/kbd';
	import ThreadRow from '$lib/components/app/thread-row.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Search from '@lucide/svelte/icons/search';
	import Keyboard from '@lucide/svelte/icons/keyboard';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	type ThreadsData = { threads: ThreadDTO[]; counts: Counts };

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'action', label: 'Needs you' },
		{ id: 'fyi', label: 'FYI' },
		{ id: 'snoozed', label: 'Snoozed' },
		{ id: 'done', label: 'Done' },
		{ id: 'muted', label: 'Muted' }
	];

	const view = $derived((page.url.searchParams.get('view') as View) || 'action');
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

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = (threadsQ.data?.threads ?? []).filter((t) => !pending.has(t.id));
		if (!q) return list;
		return list.filter((t) =>
			`${t.summary} ${t.title} ${t.repo} ${t.why} ${t.author ?? ''}`.toLowerCase().includes(q)
		);
	});
	const selectedIndex = $derived(visible.findIndex((t) => t.id === selectedId));

	// Keep a valid selection when the list changes.
	$effect(() => {
		if (!visible.some((t) => t.id === selectedId)) selectedId = visible[0]?.id ?? null;
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
		mute: 'Muted. GitHub stops notifying you about this thread.',
		undone: 'Moved to inbox',
		unsnooze: 'Moved to inbox',
		unmute: 'Unmuted'
	};

	async function run(id: string, action: ThreadAction, body?: unknown) {
		const res = await api.act(id, action, body);
		setCounts(res.counts);
		// Other views changed too; refetch them when they are next used.
		queryClient.invalidateQueries({ queryKey: keys.threadsAll });
	}

	async function act(t: ThreadDTO, action: ThreadAction, body?: unknown) {
		if (action === 'read') {
			api.act(t.id, 'read').catch(() => {});
			queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
				old
					? {
							...old,
							threads: old.threads.map((x) => (x.id === t.id ? { ...x, unread: false } : x))
						}
					: old
			);
			return;
		}
		// Optimistic: the row leaves this view now. Stop any refetch that could bring it back.
		const idx = visible.findIndex((x) => x.id === t.id);
		const next = visible[idx + 1] ?? visible[idx - 1];
		if (selectedId === t.id) selectedId = next?.id ?? null;
		pending.add(t.id);
		await queryClient.cancelQueries({ queryKey: keys.threads(view) });
		queryClient.setQueryData<ThreadsData>(keys.threads(view), (old) =>
			old ? { ...old, threads: old.threads.filter((x) => x.id !== t.id) } : old
		);
		try {
			await run(t.id, action, body);
			const undo = UNDO[action];
			toast(LABEL[action] ?? 'Done', {
				description: t.title,
				action: undo
					? { label: 'Undo', onClick: () => run(t.id, undo).catch((e) => toast.error(e.message)) }
					: undefined
			});
		} catch (err) {
			toast.error((err as Error).message);
			queryClient.invalidateQueries({ queryKey: keys.threads(view) });
		} finally {
			pending.delete(t.id);
		}
	}

	function open(t: ThreadDTO, url: string) {
		window.open(url, '_blank', 'noopener');
		if (t.unread) act(t, 'read');
	}

	function move(delta: number) {
		if (!visible.length) return;
		const i =
			selectedIndex < 0 ? 0 : Math.min(Math.max(selectedIndex + delta, 0), visible.length - 1);
		selectedId = visible[i].id;
	}

	function onKey(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const target = e.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		) {
			if (e.key === 'Escape' && target === searchEl) searchEl?.blur();
			return;
		}
		const t = visible[selectedIndex];
		const inInbox = view === 'action' || view === 'fyi';
		const keys: Record<string, () => void> = {
			j: () => move(1),
			ArrowDown: () => move(1),
			k: () => move(-1),
			ArrowUp: () => move(-1),
			o: () => t && open(t, t.actionUrl),
			Enter: () => t && open(t, t.actionUrl),
			O: () => t && open(t, t.htmlUrl),
			e: () => t && inInbox && act(t, 'done'),
			s: () => t && inInbox && act(t, 'snooze', { until: snoozeOptions()[2].until }),
			m: () => t && inInbox && act(t, 'mute'),
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

	const count = (v: View) => (v === 'action' || v === 'fyi' || v === 'snoozed' ? counts[v] : null);

	const shortcuts = [
		['J / K', 'Next / previous'],
		['Enter / O', 'Main action (review, fix CI, reply…)'],
		['Shift + O', 'Open the thread on GitHub'],
		['E', 'Done'],
		['S', 'Snooze until tomorrow 9:00'],
		['M', 'Mute the thread'],
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
		<nav class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-sm" aria-label="Views">
			{#each VIEWS as v (v.id)}
				{@const n = count(v.id)}
				<a
					href="/?view={v.id}"
					class={cn(
						'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground',
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

		<div class="relative ml-auto w-full sm:w-56">
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
		<ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5" role="listbox" aria-label="Threads">
			{#each visible as t (t.id)}
				<ThreadRow
					thread={t}
					selected={t.id === selectedId}
					onaction={act}
					onopen={open}
					onselect={() => (selectedId = t.id)}
				/>
			{/each}
		</ul>
	{/if}
</main>

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
