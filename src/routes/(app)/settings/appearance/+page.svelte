<script lang="ts">
	import { onMount } from 'svelte';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { cn } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
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

<svelte:head><title>Appearance · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Appearance</h1>
		<p class="text-sm text-muted-foreground">These settings apply to this browser only.</p>
	</div>

	<Card.Root>
		<Card.Header><Card.Title>Mode</Card.Title></Card.Header>
		<Card.Content>
			<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode">
				{#each modes as m (m.id)}
					<button
						role="radio"
						aria-checked={userPrefersMode.current === m.id}
						class={cn(
							'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-muted/50',
							userPrefersMode.current === m.id && 'border-foreground/40 bg-muted'
						)}
						onclick={() => setMode(m.id)}
					>
						<m.icon class="size-5" />{m.label}
					</button>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Theme</Card.Title>
			<Card.Description
				>Every theme has a light and a dark version; the mode above picks one. Themes from <a
					class="underline underline-offset-2"
					href="https://tweakcn.com"
					target="_blank"
					rel="noreferrer">tweakcn</a
				>.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<div
				class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
				role="radiogroup"
				aria-label="Theme"
			>
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
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content>
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

	<TabStatusSettings />
</div>
