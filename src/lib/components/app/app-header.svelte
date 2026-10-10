<script lang="ts">
	import { keysOf } from '$lib/keys.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { alertsQuery, dashQuery, leaveTo, meQuery } from '$lib/queries';
	import { fitItems } from '$lib/fit';
	import { tick } from 'svelte';
	import type { DashResponse } from '$lib/shared/types';
	import { alertsSeen } from '$lib/alerts.svelte';
	import { ui } from '$lib/ui.svelte';
	import { cn } from '$lib/utils';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Settings from '@lucide/svelte/icons/settings';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import { SITE_URL } from '$lib/site';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Plus from '@lucide/svelte/icons/plus';
	import { palette } from '$lib/palette.svelte';

	const me = createQuery(meQuery);
	const prs = createQuery(() => dashQuery('pr'));
	const issues = createQuery(() => dashQuery('issue'));
	const unreadIn = (d: DashResponse | undefined, viewId: string) =>
		d?.items.filter((i) => i.unread && !i.dismissed && i.sections.includes(viewId)).length ?? 0;

	// Alerts newer than the last time you opened the history (on this device).
	const alerts = createQuery(alertsQuery);
	const newAlerts = $derived(alerts.data?.filter((a) => a.sentAt > alertsSeen.at).length ?? 0);

	const links = $derived([
		...(me.data?.settings.views ?? []).map((v) => ({
			href: `/v/${v.id}`,
			label: v.name,
			badge: unreadIn(prs.data, v.id) + unreadIn(issues.data, v.id)
		}))
	]);

	const GAP = 2;
	const MORE_WIDTH = 72;
	const NEW_WIDTH = 28;
	let navWidth = $state(0);
	let measure = $state<HTMLElement | null>(null);
	let widths = $state<number[]>([]);
	$effect(() => {
		void links.map((l) => `${l.label}${l.badge}`).join();
		tick().then(() => {
			if (measure)
				widths = [...measure.querySelectorAll<HTMLElement>('[data-link]')].map(
					(e) => e.offsetWidth
				);
		});
	});
	const shown = $derived(
		!navWidth || widths.length !== links.length
			? links.map((_, k) => k)
			: fitItems(widths, navWidth, {
					gap: GAP,
					moreWidth: MORE_WIDTH,
					reserved: NEW_WIDTH,
					keep: links.findIndex((l) => active(l.href))
				})
	);
	const overflow = $derived(links.filter((_, k) => !shown.includes(k)));
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

{#snippet badge(n: number | null | undefined, extra = '')}
	{#if n}
		<span
			class={cn(
				'min-w-4.5 rounded-full bg-primary px-1 text-center text-[0.68rem] leading-4 text-primary-foreground tabular-nums',
				extra
			)}>{n}</span
		>
	{/if}
{/snippet}

{#snippet link(
	l: { href: string; label: string; badge: number | null | undefined },
	measured: boolean
)}
	<a
		href={l.href}
		data-link={measured ? '' : undefined}
		tabindex={measured ? -1 : undefined}
		aria-current={!measured && active(l.href) ? 'page' : undefined}
		class={cn(
			'flex max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
			active(l.href) && 'bg-muted text-foreground'
		)}
	>
		<span class="truncate">{l.label}</span>{@render badge(l.badge)}
	</a>
{/snippet}

<header class="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-12 max-w-4xl items-center gap-3 px-3 sm:gap-4 sm:px-4">
		<a
			href={SITE_URL}
			aria-label="Hush for GitHub home page"
			class="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
		>
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
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => goto('/settings/views?new=1')}
					><Plus /> New view</DropdownMenu.Item
				>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<div class="relative hidden min-w-0 flex-1 sm:block" bind:clientWidth={navWidth}>
			<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
				<div bind:this={measure} class="invisible absolute top-0 left-0 flex w-max gap-0.5 text-sm">
					{#each links as l (l.href)}{@render link(l, true)}{/each}
				</div>
			</div>
			<nav class="flex min-w-0 items-center gap-0.5 text-sm" aria-label="Views">
				{#each links as l, k (l.href)}
					{#if shown.includes(k)}{@render link(l, false)}{/if}
				{/each}
				{#if overflow.length}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
						>
							More
							{#if overflow.some((l) => l.badge)}<span class="size-1.5 rounded-full bg-primary"
								></span>{/if}
							<ChevronDown class="size-3.5" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="min-w-48">
							{#each overflow as l (l.href)}
								<DropdownMenu.Item onclick={() => goto(l.href)} class="gap-2">
									{l.label}{@render badge(l.badge, 'ml-auto')}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
				<a
					href="/settings/views?new=1"
					class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="New view"
					title="New view"><Plus class="size-4" /></a
				>
			</nav>
		</div>
		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				aria-label="Search and commands ({keysOf('palette')[0] ?? ''})"
				title="Search and commands ({keysOf('palette')[0] ?? ''})"
				class="flex h-7 items-center gap-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:w-7 max-md:justify-center md:border md:pr-1 md:pl-2 md:text-xs"
				onclick={() => (palette.open = true)}
			>
				<Search class="size-4 md:size-3.5" /><span class="hidden md:inline">Search</span><kbd
					class="hidden rounded bg-muted px-1 font-sans text-[0.65rem] md:inline"
					>{keysOf('palette')[0] ?? ''}</kbd
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
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href="{SITE_URL}/docs" target="_blank" rel="noreferrer"
									><BookOpen /> Docs</a
								>
							{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={signOut}><LogOut /> Sign out</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>
</header>
