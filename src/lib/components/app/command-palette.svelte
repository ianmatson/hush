<script lang="ts">
	import { commandFor } from '$lib/keys.svelte';
	import type { Component } from 'svelte';
	import { goto } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import { setMode, mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { itemsQuery, keys, leaveTo, meQuery, queryClient } from '$lib/queries';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import { palette, type PaletteCommand, type PeekRequest } from '$lib/palette.svelte';
	import { openOnGitHub } from '$lib/recheck';
	import { ALL_THEMES, setTheme, theme } from '$lib/theme.svelte';
	import Palette from '@lucide/svelte/icons/palette';
	import type { ListView } from '$lib/api';
	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Hourglass from '@lucide/svelte/icons/hourglass';
	import Newspaper from '@lucide/svelte/icons/newspaper';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import Check from '@lucide/svelte/icons/check';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import Settings from '@lucide/svelte/icons/settings';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import SunMoon from '@lucide/svelte/icons/sun-moon';
	import LogOut from '@lucide/svelte/icons/log-out';
	import History from '@lucide/svelte/icons/history';
	import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';

	/**
	 * ⌘K / Ctrl+K: find an item (Enter peeks, ⌘Enter opens GitHub), run an action on
	 * the current row, go to a page, or run a command. Searches only data Hush already has.
	 */
	interface Entry extends PaletteCommand {
		/** github.com URL, for ⌘Enter. */
		url?: string;
		/** Right side: where the item lives. */
		where?: string;
	}

	const LANES: { id: 'turn' | 'waiting' | 'updates'; label: string }[] = [
		{ id: 'turn', label: 'Your turn' },
		{ id: 'waiting', label: 'Waiting' },
		{ id: 'updates', label: 'Updates' }
	];
	// The lanes are fetched when the palette opens (Hush keeps them fresh anyway).
	const lists = LANES.map((v) =>
		createQuery(() => ({ ...itemsQuery(v.id), enabled: palette.open }))
	);

	let search = $state('');
	let highlighted = $state('');

	function peek(req: PeekRequest, href: string) {
		palette.peekRequest = req;
		goto(href);
	}

	const itemEntries = $derived.by((): Entry[] => {
		if (!palette.open) return [];
		return LANES.flatMap((v, k) =>
			(lists[k].data?.items ?? []).map((t) => ({
				id: `item:${t.key}`,
				label: t.title,
				detail: t.number ? `${t.repo}#${t.number}` : t.repo,
				icon: (t.subjectType === 'PullRequest'
					? GitPullRequest
					: t.subjectType === 'Issue'
						? CircleDot
						: Bell) as Component,
				keywords: [t.repo, t.number ? `#${t.number}` : '', t.author ?? '', t.summary, t.reason],
				url: t.url,
				where: v.label,
				run: () =>
					t.number
						? peek({ list: v.id, key: t.key }, `/${v.id}`)
						: window.open(t.url, '_blank', 'noopener')
			}))
		);
	});

	const me = createQuery(meQuery);
	const search_ = (inState: ListView) => `/search?in=${inState}`;
	const goEntries = $derived<Entry[]>([
		{
			id: 'go:turn',
			label: 'Your turn',
			icon: Inbox,
			keywords: ['home', 'needs', 'inbox'],
			run: () => goto('/turn')
		},
		{
			id: 'go:waiting',
			label: 'Waiting',
			icon: Hourglass,
			keywords: ['others', 'blocked'],
			run: () => goto('/waiting')
		},
		{
			id: 'go:updates',
			label: 'Updates',
			icon: Newspaper,
			keywords: ['fyi', 'feed', 'news'],
			run: () => goto('/updates')
		},
		{
			id: 'go:search',
			label: 'Search',
			icon: Search,
			keywords: ['find', 'all', 'query'],
			run: () => goto('/search')
		},
		{
			id: 'go:done',
			label: 'Done',
			icon: Check,
			keywords: ['finished', 'handled'],
			run: () => goto(search_('done'))
		},
		{
			id: 'go:snoozed',
			label: 'Snoozed',
			icon: AlarmClock,
			keywords: ['later'],
			run: () => goto(search_('snoozed'))
		},
		{
			id: 'go:muted',
			label: 'Muted',
			icon: BellOff,
			keywords: ['hidden'],
			run: () => goto(search_('muted'))
		},
		...(me.data?.settings.saved ?? []).map((v) => ({
			id: `go:saved:${v.id}`,
			label: v.name,
			where: 'Saved search',
			icon: Bookmark as Component,
			keywords: ['saved', 'search', v.query],
			run: () => goto(`/search?s=${v.id}`)
		})),
		...(
			[
				['turn', 'Your turn', 'team bots reviews stale read'],
				['notifications', 'Notifications', 'push quiet devices'],
				['account', 'Account', 'github token orgs sessions sign out delete appearance theme'],
				['advanced', 'Advanced', 'rules searches menus feeds export import'],
				['keys', 'Keybinds', 'keyboard shortcuts keybindings hotkeys keys'],
				['json', 'settings.json', 'json advanced all every raw']
			] as const
		).map(([slug, name, more]) => ({
			id: `go:settings/${slug}`,
			label: `Settings: ${name}`,
			icon: Settings,
			keywords: ['settings', 'preferences', slug, ...more.split(' ')],
			run: () => goto(`/settings/${slug}`)
		}))
	]);

	async function syncNow() {
		const t = toast.loading('Syncing with GitHub…');
		try {
			const status = await api.sync();
			await queryClient.invalidateQueries({ queryKey: keys.itemsAll });
			await queryClient.invalidateQueries({ queryKey: keys.me });
			if (status.lastError) toast.error(status.lastError, { id: t });
			else toast.success('Synced', { id: t });
		} catch (err) {
			toast.error((err as Error).message, { id: t });
		}
	}

	const globalCommands = $derived<Entry[]>([
		{
			id: 'cmd:sync',
			label: 'Sync with GitHub now',
			icon: RefreshCw,
			keywords: ['refresh', 'poll'],
			run: syncNow
		},
		{
			id: 'cmd:theme',
			label: mode.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
			icon: SunMoon,
			keywords: ['theme', 'appearance', 'dark', 'light'],
			run: () => setMode(mode.current === 'dark' ? 'light' : 'dark')
		},
		...ALL_THEMES.filter((t) => t.id !== theme.current).map((t) => ({
			id: `cmd:theme:${t.id}`,
			label: `Theme: ${t.label}`,
			icon: Palette,
			keywords: ['theme', 'colors', 'appearance'],
			run: () => setTheme(t.id)
		})),
		{
			id: 'cmd:signout',
			label: 'Sign out',
			icon: LogOut,
			keywords: ['logout', 'log out'],
			run: async () => {
				await api.logout().catch(() => {});
				leaveTo('/login');
			}
		}
	]);

	const pageCommands = $derived<Entry[]>(palette.open ? palette.pageCommands : []);
	const all = $derived([...pageCommands, ...itemEntries, ...goEntries, ...globalCommands]);
	const byId = $derived(new Map(all.map((e) => [e.id, e])));
	const recent = $derived(
		palette.recent
			.map((id) => byId.get(id))
			.filter((e): e is Entry => !!e && !e.id.startsWith('act:'))
	);

	/**
	 * Every typed word must be in the text (the default fuzzy match finds "glossary" in any long
	 * title with those letters in order). Words that start a word, or the text, rank higher.
	 */
	function filter(value: string, query: string, keywords?: string[]): number {
		const hay = `${value} ${keywords?.join(' ') ?? ''}`.toLowerCase();
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		let score = 0;
		for (const w of words) {
			const i = hay.indexOf(w);
			if (i < 0) return 0;
			score += i === 0 ? 3 : /[\s#/(\-_:.@]/.test(hay[i - 1]) ? 2 : 1;
		}
		return score / (3 * words.length);
	}

	/**
	 * Runs once the palette has closed. A dialog that opens while this one is still closing (the
	 * peek sheet on phones) would take its close as an outside click and close at once.
	 */
	let pending: (() => void) | null = null;

	function choose(e: Entry, newTab = false) {
		palette.remember(e.id);
		// A new tab must open inside the key or click handler, or the browser blocks it.
		if (newTab && e.url) openOnGitHub(e.url);
		else pending = e.run;
		palette.open = false;
	}

	function onGlobalKey(e: KeyboardEvent) {
		const cmd = commandFor(e, ['global']);
		if (cmd === 'palette') {
			e.preventDefault();
			palette.open = !palette.open;
			return;
		}
		// The lanes and saved searches, but not while you type or a menu or dialog is open.
		const t = e.target;
		if (!cmd || palette.open) return;
		if (
			t instanceof Element &&
			t.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const lanes: Record<string, string> = {
			'nav.turn': '/turn',
			'nav.waiting': '/waiting',
			'nav.updates': '/updates'
		};
		const saved = cmd.match(/^nav\.saved\.(\d)$/);
		const href = lanes[cmd] ?? (saved ? savedHref(Number(saved[1])) : null);
		if (href) {
			e.preventDefault();
			goto(href);
		}
	}
	const savedHref = (n: number) => {
		const v = me.data?.settings.saved[n - 1];
		return v ? `/search?s=${v.id}` : null;
	};

	/** ⌘Enter / Ctrl+Enter: open the highlighted item on GitHub instead of peeking. */
	function onListKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
		const value = highlighted.replace(/^recent:/, '');
		const entry = all.find((x) => valueOf(x) === value);
		if (entry?.url) {
			e.preventDefault();
			e.stopPropagation();
			choose(entry, true);
		}
	}

	// A new opening starts empty.
	$effect(() => {
		if (palette.open) search = '';
	});

	// The filter matches on value and keywords; the id keeps values unique.
	const valueOf = (e: Entry) => `${e.label} ${e.detail ?? ''} ${e.id}`;
	const groups = $derived([
		{
			// The actions' target, once, instead of on every row.
			heading: pageCommands.find((c) => c.detail)?.detail
				? `Actions · ${pageCommands.find((c) => c.detail)!.detail}`
				: 'Actions',
			items: pageCommands
		},
		// Threads and PRs only once you type: hundreds of rows are noise in the empty palette.
		{ heading: 'Saved searches', items: goEntries.filter((e) => e.id.startsWith('go:view:')) },
		{ heading: 'Items', items: search.trim() ? itemEntries : [] },
		{ heading: 'Go to', items: goEntries.filter((e) => !e.id.startsWith('go:view:')) },
		{
			heading: 'Commands',
			// Themes only once you type ("theme", "gruvbox"…): 15 rows are noise otherwise.
			items: search.trim()
				? globalCommands
				: globalCommands.filter((c) => !c.id.startsWith('cmd:theme:'))
		}
	]);
</script>

<svelte:window onkeydown={onGlobalKey} />

{#snippet row(e: Entry, prefix: string)}
	<Command.Item
		value={`${prefix}${valueOf(e)}`}
		keywords={e.keywords?.filter(Boolean)}
		onSelect={() => choose(e)}
		class="gap-2.5 py-2 max-sm:py-3"
	>
		{#if e.icon}<e.icon class="text-muted-foreground" />{/if}
		<span class="min-w-0 flex-1 truncate">
			{e.label}
			{#if e.detail && !e.id.startsWith('act:')}<span
					class="ml-1 font-mono text-[0.75rem] text-muted-foreground">{e.detail}</span
				>{/if}
		</span>
		{#if e.where}
			<span class="shrink-0 text-xs text-muted-foreground">{e.where}</span>
		{/if}
		{#if e.shortcut}<Command.Shortcut>{e.shortcut}</Command.Shortcut>{/if}
	</Command.Item>
{/snippet}

<Dialog.Root
	bind:open={palette.open}
	onOpenChangeComplete={(open) => {
		if (open) return;
		const run = pending;
		pending = null;
		run?.();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none sm:max-w-xl"
	>
		<Dialog.Title class="sr-only">Command palette</Dialog.Title>
		<Dialog.Description class="sr-only"
			>Find an item, run an action, or go to a page.</Dialog.Description
		>
		<Command.Root
			bind:value={highlighted}
			class="rounded-none! max-sm:h-full"
			onkeydown={onListKey}
			{filter}
			loop
		>
			<div class="flex items-center gap-1 p-1 pb-0">
				<div class="min-w-0 flex-1">
					<Command.Input
						bind:value={search}
						placeholder="Search items, actions, pages…"
						class="max-sm:text-base"
					/>
				</div>
				<button
					type="button"
					class="px-2 text-sm text-muted-foreground sm:hidden"
					onclick={() => (palette.open = false)}>Cancel</button
				>
			</div>
			<Command.List class="max-h-[min(28rem,60vh)] max-sm:max-h-none max-sm:flex-1">
				<Command.Empty>Nothing matches “{search}”.</Command.Empty>
				{#if !search && recent.length}
					<Command.Group heading="Recent">
						{#each recent as e (e.id)}
							{@render row({ ...e, icon: e.icon ?? History }, 'recent:')}
						{/each}
					</Command.Group>
				{/if}
				{#each groups as g (g.heading)}
					{#if g.items.length}
						<Command.Group heading={g.heading}>
							{#each g.items as e (e.id)}
								{@render row(e, '')}
							{/each}
						</Command.Group>
					{/if}
				{/each}
			</Command.List>
			<div
				class="hidden items-center gap-3 border-t px-3 py-2 text-[0.7rem] text-muted-foreground sm:flex"
			>
				<span class="flex items-center gap-1"><CornerDownLeft class="size-3" />Peek or run</span>
				<span><kbd class="font-sans">⌘</kbd><kbd class="font-sans">↵</kbd> Open on GitHub</span>
				<span class="ml-auto"><kbd class="font-sans">Esc</kbd> Close</span>
			</div>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
