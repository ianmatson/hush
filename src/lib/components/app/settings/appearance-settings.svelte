<script lang="ts">
	import { onMount } from 'svelte';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { cn } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import TabStatusSettings from '$lib/components/app/tab-status-settings.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Check from '@lucide/svelte/icons/check';
	import { ALL_THEMES, setTheme, theme } from '$lib/theme.svelte';
	import type { ThemeSwatch } from '$lib/themes/list';

	const modes = [
		{ id: 'light', label: 'Light', icon: Sun },
		{ id: 'dark', label: 'Dark', icon: Moon },
		{ id: 'system', label: 'System', icon: Monitor }
	] as const;

	// The theme grid is large: it opens in a dialog.
	let themesOpen = $state(false);
	const current = $derived(ALL_THEMES.find((t) => t.id === theme.current));

	const starts = { '/inbox': 'Inbox', '/pulls': 'Pull requests', '/issues': 'Issues' } as const;
	let start = $state<keyof typeof starts>('/inbox');
	onMount(() => {
		const saved = localStorage.getItem('hush:start');
		start = saved && saved in starts ? (saved as keyof typeof starts) : '/inbox';
	});
	$effect(() => localStorage.setItem('hush:start', start));
</script>

{#snippet swatch(c: ThemeSwatch)}
	<!-- A tiny page in the theme's colors: text lines, a button, and an accent. -->
	<span class="flex flex-col justify-center gap-1.5 px-2" style="background: {c.bg}">
		<span class="h-1.5 w-3/4 rounded-full" style="background: {c.fg}; opacity: 0.8"></span>
		<span class="h-1.5 w-1/2 rounded-full" style="background: {c.muted}"></span>
		<span class="flex gap-1">
			<span class="h-2.5 w-6 rounded-sm" style="background: {c.primary}"></span>
			<span class="h-2.5 w-3 rounded-sm" style="background: {c.accent}"></span>
		</span>
	</span>
{/snippet}

<div class="grid gap-6">
	<div>
		<h2 class="text-base font-semibold tracking-tight">Appearance</h2>
		<p class="text-sm text-muted-foreground">These settings apply to this browser only.</p>
	</div>

	<Card.Root>
		<Card.Content class="divide-y">
			<SettingRow label="Mode">
				<div class="flex gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Mode">
					{#each modes as m (m.id)}
						<button
							role="radio"
							aria-checked={userPrefersMode.current === m.id}
							class={cn(
								'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
								userPrefersMode.current === m.id && 'bg-background text-foreground shadow-xs'
							)}
							onclick={() => setMode(m.id)}
						>
							<m.icon class="size-3.5" />{m.label}
						</button>
					{/each}
				</div>
			</SettingRow>
			<SettingRow label="Theme" description="Each theme has a light and a dark version.">
				<Button variant="outline" size="sm" class="gap-2" onclick={() => (themesOpen = true)}>
					{#if current}
						<span
							class="grid h-4 w-7 grid-cols-2 overflow-hidden rounded-sm ring-1 ring-foreground/10"
							><span style="background: {current.light.primary}"></span><span
								style="background: {current.dark.primary}"
							></span></span
						>{current.label}
					{/if}
					<span class="text-muted-foreground">Change…</span>
				</Button>
			</SettingRow>
			<SettingRow label="Start page" description="The tab Hush opens first.">
				<Select.Root type="single" bind:value={start}>
					<Select.Trigger class="w-40">{starts[start]}</Select.Trigger>
					<Select.Content>
						{#each Object.entries(starts) as [value, label] (value)}
							<Select.Item {value} {label} />
						{/each}
					</Select.Content>
				</Select.Root>
			</SettingRow>
		</Card.Content>
	</Card.Root>

	<Dialog.Root bind:open={themesOpen}>
		<Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title>Theme</Dialog.Title>
				<Dialog.Description
					>The mode picks the light or dark version. Themes from <a
						class="underline underline-offset-2"
						href="https://tweakcn.com"
						target="_blank"
						rel="noreferrer">tweakcn</a
					>.</Dialog.Description
				>
			</Dialog.Header>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
				{#each ALL_THEMES as t (t.id)}
					{@const on = theme.current === t.id}
					<button
						role="radio"
						aria-checked={on}
						class={cn(
							'group grid gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted/50',
							on && 'border-foreground/40 bg-muted'
						)}
						onclick={() => setTheme(t.id)}
					>
						<span
							class="grid h-14 grid-cols-2 overflow-hidden rounded-md ring-1 ring-foreground/10"
						>
							{@render swatch(t.light)}
							{@render swatch(t.dark)}
						</span>
						<span class="flex items-center gap-1.5 px-0.5">
							<span class="truncate">{t.label}</span>
							{#if on}<Check class="ml-auto size-4 shrink-0" />{/if}
						</span>
					</button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>

	<TabStatusSettings />
</div>
