<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { alertsQuery, dashQuery, leaveTo, meQuery, threadsQuery, turnCount } from '$lib/queries';
	import { alertsSeen } from '$lib/alerts.svelte';
	import { ui } from '$lib/ui.svelte';
	import { cn } from '$lib/utils';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Settings from '@lucide/svelte/icons/settings';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { palette } from '$lib/palette.svelte';

	const me = createQuery(meQuery);
	const inboxCount = createQuery(() => ({
		...threadsQuery('action'),
		select: (d) => d.counts.action
	}));
	const prTurns = createQuery(() => ({ ...dashQuery('pr'), select: turnCount }));
	const issueTurns = createQuery(() => ({ ...dashQuery('issue'), select: turnCount }));

	// Alerts newer than the last time you opened the history (on this device).
	const alerts = createQuery(alertsQuery);
	const newAlerts = $derived(alerts.data?.filter((a) => a.sentAt > alertsSeen.at).length ?? 0);

	const links = $derived([
		{ href: '/inbox', label: 'Inbox', badge: inboxCount.data },
		{ href: '/pulls', label: 'Pull requests', badge: prTurns.data },
		{ href: '/issues', label: 'Issues', badge: issueTurns.data }
	]);
	const active = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	// Phones: one menu instead of three tabs. On settings pages it reads "Go to".
	const current = $derived(links.find((l) => active(l.href)));
	const othersWaiting = $derived(links.some((l) => l !== current && l.badge));

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}
</script>

<header class="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
		<a href="/inbox" class="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
			<img src="/icon.svg" alt="" class="size-5 rounded-[5px]" />
			<span class="hidden sm:inline">hush</span>
		</a>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex h-8 min-w-0 items-center gap-1.5 rounded-md bg-muted px-2.5 text-sm sm:hidden"
			>
				<span class="truncate">{current?.label ?? 'Go to'}</span>
				{#if current?.badge}
					<span
						class="min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums"
						>{current.badge}</span
					>
				{/if}
				{#if othersWaiting}
					<span class="size-1.5 rounded-full bg-primary" aria-label="Other pages have items"></span>
				{/if}
				<ChevronDown class="size-3.5 text-muted-foreground" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-48">
				{#each links as l (l.href)}
					<DropdownMenu.Item onclick={() => goto(l.href)} class={cn(active(l.href) && 'bg-muted')}>
						{l.label}
						{#if l.badge}
							<span
								class="ml-auto min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums"
								>{l.badge}</span
							>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<nav class="hidden min-w-0 items-center gap-0.5 overflow-x-auto pr-1 text-sm sm:flex">
			{#each links as l (l.href)}
				<a
					href={l.href}
					class={cn(
						'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground',
						active(l.href) && 'bg-muted text-foreground'
					)}
				>
					{l.label}
					{#if l.badge}
						<span
							class="min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums"
							>{l.badge}</span
						>
					{/if}
				</a>
			{/each}
		</nav>
		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				aria-label="Search and commands (⌘K)"
				title="Search and commands (⌘K)"
				class="flex h-7 items-center gap-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:w-7 max-md:justify-center md:border md:pr-1 md:pl-2 md:text-xs"
				onclick={() => (palette.open = true)}
			>
				<Search class="size-4 md:size-3.5" /><span class="hidden md:inline">Search</span><kbd
					class="hidden rounded bg-muted px-1 font-sans text-[0.65rem] md:inline">⌘K</kbd
				>
			</button>
			<button
				type="button"
				aria-label={newAlerts ? `Alerts, ${newAlerts} new` : 'Alerts'}
				aria-pressed={ui.alertsOpen}
				title="Alerts"
				class={cn(
					'relative flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
					ui.alertsOpen && 'bg-muted text-foreground'
				)}
				onclick={() => (ui.alertsOpen = !ui.alertsOpen)}
			>
				<Bell class="size-4" />
				{#if newAlerts}
					<span
						class="absolute -top-0.5 -right-0.5 min-w-3.5 rounded-full bg-primary px-0.5 text-center text-[0.6rem] leading-3.5 text-primary-foreground tabular-nums"
						>{newAlerts > 9 ? '9+' : newAlerts}</span
					>
				{/if}
			</button>
			{#if me.data}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						aria-label="Account menu"
						class="cursor-pointer rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
					>
						<Avatar.Root class="size-7">
							<Avatar.Image src={me.data.avatarUrl} alt={me.data.login} />
							<Avatar.Fallback>{me.data.login.slice(0, 2).toUpperCase()}</Avatar.Fallback>
						</Avatar.Root>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-48">
						<DropdownMenu.Label>
							<div class="text-sm font-medium text-foreground">{me.data.name ?? me.data.login}</div>
							<div class="text-xs font-normal text-muted-foreground">@{me.data.login}</div>
						</DropdownMenu.Label>
						{#if me.data.tokenSource === 'own'}
							<DropdownMenu.Item onclick={() => goto('/settings/general#token')}
								><KeyRound class="text-signal-warn" /> Using a custom token</DropdownMenu.Item
							>
						{/if}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => goto('/settings')}
							><Settings /> Settings</DropdownMenu.Item
						>
						<DropdownMenu.Item onclick={signOut}><LogOut /> Sign out</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>
</header>
