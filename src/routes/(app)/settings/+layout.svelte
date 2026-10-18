<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { SETTINGS_SECTIONS, type SettingsPage } from '$lib/shared/settings-schema';
	import { SETTINGS_ICONS } from '$lib/settings-icons';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { children } = $props();

	const sections = (Object.keys(SETTINGS_SECTIONS) as SettingsPage[]).map((section) => ({
		...SETTINGS_SECTIONS[section],
		icon: SETTINGS_ICONS[section]
	}));
	const current = $derived(sections.find((s) => page.url.pathname === s.href));
</script>

<div
	data-page
	class="mx-auto flex max-w-4xl flex-col gap-4 px-3 pt-3 pb-24 sm:px-4 sm:pt-6 md:flex-row md:gap-6"
>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="flex h-10 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium md:hidden"
			aria-label="Settings section"
		>
			{#if current}<current.icon class="size-4 text-muted-foreground" />{/if}
			{current?.label ?? 'Settings'}
			<ChevronDown class="ml-auto size-4 text-muted-foreground" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-(--bits-dropdown-menu-anchor-width)">
			{#each sections as s (s.href)}
				<DropdownMenu.Item class={cn(s.needsKeyboard && 'pointer-coarse:hidden')}>
					{#snippet child({ props })}
						<a {...props} href={s.href}>
							<s.icon />{s.label}
							{#if s === current}<Check class="ml-auto" />{/if}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<nav
		class="hidden w-44 shrink-0 flex-col gap-1 md:sticky md:top-18 md:flex md:self-start"
		aria-label="Settings"
	>
		{#each sections as s (s.href)}
			<a
				href={s.href}
				class={cn(
					'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
					page.url.pathname === s.href && 'bg-muted text-foreground',
					s.needsKeyboard && 'pointer-coarse:hidden'
				)}
			>
				<s.icon class="size-4" />{s.label}
			</a>
		{/each}
	</nav>
	<main class="min-w-0 flex-1">{@render children()}</main>
</div>
