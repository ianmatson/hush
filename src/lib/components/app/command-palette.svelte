<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { commandFor } from '$lib/keys.svelte';
	import type { Component } from 'svelte';
	import { goto } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import { setMode, mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { dashQuery, keys, leaveTo, meQuery, queryClient, refetchUnlessLive } from '$lib/queries';
	import LayoutList from '@lucide/svelte/icons/layout-list';
	import { palette, type PaletteCommand, type PeekRequest } from '$lib/palette.svelte';
	import { openOnGitHub } from '$lib/recheck';
	import { ALL_THEMES, setTheme, theme } from '$lib/theme.svelte';
	import Palette from '@lucide/svelte/icons/palette';
	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import Settings from '@lucide/svelte/icons/settings';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import SunMoon from '@lucide/svelte/icons/sun-moon';
	import LogOut from '@lucide/svelte/icons/log-out';
	import History from '@lucide/svelte/icons/history';
	import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';
	import ToggleLeft from '@lucide/svelte/icons/toggle-left';
	import ToggleRight from '@lucide/svelte/icons/toggle-right';
	import { saveSettings } from '$lib/save-settings';
	import { SETTING_TOGGLES } from '$lib/setting-toggles';

	/**
	 * ⌘K / Ctrl+K: find a PR or issue (Enter peeks, ⌘Enter opens GitHub), run an action on the
	 * current row, go to a page, or run a command. Searches only data Hush already has.
	 */
	interface Entry extends PaletteCommand {
		/** github.com URL, for ⌘Enter. */
		url?: string;
		/** Right side: where the item lives. */
		where?: string;
	}

	const touchOnly = new MediaQuery('pointer: coarse');
	const me = createQuery(meQuery);
	const prs = createQuery(() => dashQuery('pr'));
	const issues = createQuery(() => dashQuery('issue'));

	let search = $state('');
	let highlighted = $state('');

	function peek(req: PeekRequest, href: string) {
		palette.peekRequest = req;
		goto(href);
	}

	const dashEntries = $derived.by((): Entry[] => {
		if (!palette.open) return [];
		const turn = { you: 'Your turn', team: "Team's turn", them: 'Waiting', none: 'Other' };
		const views = me.data?.settings.views ?? [];
		return [prs.data, issues.data].flatMap((d) =>
			(d?.items ?? [])
				.flatMap((i) => {
					const home = views.find((v) => i.sections.includes(v.id));
					return home ? [{ i, home }] : [];
				})
				.map(({ i, home }) => ({
					id: `dash:${i.id}`,
					label: i.title,
					detail: `${i.repo}#${i.number}`,
					icon: (i.kind === 'pr' ? GitPullRequest : CircleDot) as Component,
					keywords: [
						i.repo,
						`#${i.number}`,
						i.author,
						i.turnReason,
						...i.labels.map((l) => l.name)
					],
					url: i.url,
					where: `${home.name} · ${i.kind === 'pr' ? 'PR' : 'Issue'} · ${turn[i.turn]}`,
					run: () =>
						peek(
							{ page: 'view', view: home.id, kind: i.kind, id: i.id },
							`/v/${home.id}?show=${i.kind}`
						)
				}))
		);
	});

	const goEntries = $derived<Entry[]>([
		...(me.data?.settings.views ?? []).map((v) => ({
			id: `go:view:${v.id}`,
			label: v.name,
			where: 'View',
			icon: LayoutList as Component,
			keywords: ['view', 'prs', 'issues', ...v.searches],
			run: () => goto(`/v/${v.id}`)
		})),
		...(
			[
				['general', 'General', 'appearance menus account export import'],
				['keys', 'Keybinds', 'keyboard shortcuts keybindings hotkeys keys'],
				['json', 'settings.json', 'json advanced all every raw'],
				['views', 'Views', 'views searches sources tracked teams dashboards'],
				[
					'categories',
					'Categories',
					'categories groups rules labels effort impact feeds smart jev'
				],
				['notifications', 'Notifications', 'push quiet']
			] as const
		)
			.filter(([slug]) => slug !== 'keys' || !touchOnly.current)
			.map(([slug, name, more]) => ({
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
			await refetchUnlessLive(keys.dashAll);
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

	const settingEntries = $derived.by((): Entry[] => {
		const settings = me.data?.settings;
		if (!settings) return [];
		return SETTING_TOGGLES.map((t) => {
			const on = t.isOn(settings);
			return {
				id: `setting:${t.key}`,
				label: `${on ? 'Turn off' : 'Turn on'}: ${t.label}`,
				icon: on ? ToggleRight : ToggleLeft,
				keywords: ['setting', 'toggle', 'enable', 'disable', t.key, ...t.keywords],
				where: on ? 'On' : 'Off',
				run: () => saveSettings(t.patch(settings, !on), `${t.label}: ${on ? 'off' : 'on'}`)
			};
		});
	});

	const pageCommands = $derived<Entry[]>(palette.open ? palette.pageCommands : []);
	const all = $derived([
		...pageCommands,
		...dashEntries,
		...goEntries,
		...settingEntries,
		...globalCommands
	]);
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
		if (commandFor(e, ['global']) === 'palette') {
			e.preventDefault();
			palette.open = !palette.open;
		}
	}

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
		// PRs and issues only once you type: hundreds of rows are noise in the empty palette.
		{ heading: 'Views', items: goEntries.filter((e) => e.id.startsWith('go:view:')) },
		{ heading: 'Pull requests and issues', items: search.trim() ? dashEntries : [] },
		{ heading: 'Go to', items: goEntries.filter((e) => !e.id.startsWith('go:view:')) },
		{ heading: 'Settings', items: search.trim() ? settingEntries : [] },
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
		{#if e.shortcut}<Command.Shortcut class="pointer-coarse:hidden">{e.shortcut}</Command.Shortcut
			>{/if}
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
			>Find a pull request or issue, run an action, or go to a page.</Dialog.Description
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
						placeholder="Search PRs, issues, actions, pages…"
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
