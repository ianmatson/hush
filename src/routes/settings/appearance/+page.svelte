<script lang="ts">
	import { onMount } from 'svelte';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { cn } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';

	const modes = [
		{ id: 'light', label: 'Light', icon: Sun },
		{ id: 'dark', label: 'Dark', icon: Moon },
		{ id: 'system', label: 'System', icon: Monitor }
	] as const;

	const starts = { '/': 'Inbox', '/pulls': 'Pull requests', '/issues': 'Issues' } as const;
	let start = $state<keyof typeof starts>('/');
	onMount(() => (start = (localStorage.getItem('hush:start') as keyof typeof starts) || '/'));
	$effect(() => localStorage.setItem('hush:start', start));
</script>

<svelte:head><title>Appearance · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Appearance</h1>
		<p class="text-sm text-muted-foreground">These settings apply to this browser only.</p>
	</div>

	<Card.Root>
		<Card.Header><Card.Title>Theme</Card.Title></Card.Header>
		<Card.Content>
			<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
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
</div>
