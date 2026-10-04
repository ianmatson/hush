<script lang="ts">
	import { keysOf } from '$lib/keys.svelte';
	import { goto } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { alertsQuery, leaveTo, meQuery } from '$lib/queries';
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
	import { palette } from '$lib/palette.svelte';

	const me = createQuery(meQuery);

	// Alerts newer than the last time you opened the history (on this device).
	const alerts = createQuery(alertsQuery);
	const newAlerts = $derived(alerts.data?.filter((a) => a.sentAt > alertsSeen.at).length ?? 0);

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}
</script>

<header class="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
		<a
			href="/items"
			aria-label="Items"
			class="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
		>
			<img src="/icon.svg" alt="" class="size-5 rounded-[5px]" />
			<span class="hidden sm:inline">hush</span>
		</a>
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
				aria-label={newAlerts ? `Notifications, ${newAlerts} new` : 'Notifications'}
				aria-pressed={ui.alertsOpen}
				title="Notifications"
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
