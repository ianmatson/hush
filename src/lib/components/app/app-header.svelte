<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { clearCache, dashQuery, meQuery, threadsQuery, turnCount } from '$lib/queries';
	import { cn } from '$lib/utils';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ThemeToggle from './theme-toggle.svelte';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';

	const me = createQuery(meQuery);
	const inboxCount = createQuery(() => ({
		...threadsQuery('action'),
		select: (d) => d.counts.action
	}));
	const prTurns = createQuery(() => ({ ...dashQuery('pr'), select: turnCount }));
	const issueTurns = createQuery(() => ({ ...dashQuery('issue'), select: turnCount }));

	const links = $derived([
		{ href: '/', label: 'Inbox', badge: inboxCount.data },
		{ href: '/pulls', label: 'Pull requests', badge: prTurns.data },
		{ href: '/issues', label: 'Issues', badge: issueTurns.data }
	]);
	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	async function signOut() {
		await api.logout();
		clearCache();
		await goto('/login');
	}
</script>

<header class="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
		<a href="/" class="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
			<img src="/icon.svg" alt="" class="size-5 rounded-[5px]" />
			<span class="hidden sm:inline">hush</span>
		</a>
		<nav class="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm">
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
			<a
				href="/settings"
				aria-label="Settings"
				class={cn(
					'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
					active('/settings') && 'bg-muted text-foreground'
				)}><Settings class="size-4" /></a
			>
			<ThemeToggle />
			{#if me.data}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						aria-label="Account menu"
						class="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
