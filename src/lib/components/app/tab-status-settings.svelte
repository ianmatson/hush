<script lang="ts">
	import { createTabCounts } from '$lib/tab-counts.svelte';
	import {
		DEFAULT_PREFS,
		DOT_COLORS,
		SOURCES,
		faviconHref,
		loadPrefs,
		savePrefs,
		titlePrefix,
		total,
		type CountSource,
		type DotColor
	} from '$lib/tab-status';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	let prefs = $state(loadPrefs());
	// Save on every change; the live component in the shell listens for it.
	$effect(() => savePrefs($state.snapshot(prefs)));

	const tabCounts = createTabCounts();
	const counts = $derived(tabCounts.current);

	function toggle(list: CountSource[], id: CountSource, on: boolean): CountSource[] {
		return on ? [...new Set([...list, id])] : list.filter((s) => s !== id);
	}

	const styles = {
		total: 'Total, e.g. (12)',
		breakdown: 'Breakdown, e.g. (7 · 3 PR · 2 issue)'
	} as const;
	const previewTitle = $derived(
		[titlePrefix(counts, prefs.title), 'Hush'].filter(Boolean).join(' ')
	);
	const previewDot = $derived(
		prefs.favicon.enabled && total(counts, prefs.favicon.sources) > 0
			? DOT_COLORS[prefs.favicon.color]
			: null
	);
	const previewCount = $derived(
		prefs.favicon.style === 'count' ? total(counts, prefs.favicon.sources) : undefined
	);
	const dotStyles = { count: 'Number', dot: 'Dot only' } as const;
	const previewBadge = $derived(prefs.appBadge.enabled ? total(counts, prefs.appBadge.sources) : 0);
	const canBadge = typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
</script>

{#snippet sources(group: 'title' | 'favicon' | 'appBadge')}
	<!-- What counts: a small menu with checkboxes (six sources for each of the three places). -->
	{@const on = SOURCES.filter((x) => prefs[group].sources.includes(x.id))}
	<div class="flex items-center gap-3">
		<span class="text-xs text-muted-foreground">Count</span>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger disabled={!prefs[group].enabled}>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="max-w-72 justify-start font-normal">
						<span class="truncate"
							>{on.length === 0
								? 'Nothing'
								: on.length === 1
									? on[0].label
									: `${on.length} counts`}</span
						>
						<ChevronDown class="ml-auto opacity-60" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-72">
				{#each SOURCES as x (x.id)}
					<DropdownMenu.CheckboxItem
						checked={prefs[group].sources.includes(x.id)}
						closeOnSelect={false}
						onCheckedChange={(v) =>
							(prefs[group].sources = toggle(prefs[group].sources, x.id, v === true))}
					>
						<span class="flex-1">{x.label}</span>
						<span class="text-xs text-muted-foreground tabular-nums">{counts[x.id]}</span>
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/snippet}

<Card.Root>
	<Card.Header>
		<div class="flex items-start justify-between gap-2">
			<div class="grid gap-1.5">
				<Card.Title>Tab title & icon</Card.Title>
				<Card.Description
					>Show unread alerts (or what needs you) on the browser tab, and on the app icon when Hush
					is installed.</Card.Description
				>
			</div>
			<Button variant="ghost" size="xs" onclick={() => (prefs = structuredClone(DEFAULT_PREFS))}
				><RotateCcw /> Defaults</Button
			>
		</div>
	</Card.Header>
	<Card.Content class="grid gap-6">
		<!-- Live preview with your current counts. -->
		<div class="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
			<div
				class="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 shadow-xs"
			>
				<img src={faviconHref(previewDot, previewCount)} alt="" class="size-4 shrink-0" />
				<span class="truncate text-sm">{previewTitle}</span>
			</div>
			{#if prefs.appBadge.enabled}
				<div class="relative ml-auto shrink-0" title="App icon badge">
					<img src="/icon.svg" alt="" class="size-9 rounded-lg" />
					{#if previewBadge}
						<span
							class="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[0.68rem] leading-5 font-semibold text-white tabular-nums"
							>{previewBadge}</span
						>
					{/if}
				</div>
			{/if}
		</div>

		<section class="grid gap-3">
			<div class="flex items-center justify-between gap-4">
				<Label for="ts-title" class="grid gap-0.5">
					<span>Count in the page title</span>
					<span class="text-xs font-normal text-muted-foreground"
						>Nothing is added when the count is 0.</span
					>
				</Label>
				<Switch id="ts-title" bind:checked={prefs.title.enabled} />
			</div>
			{@render sources('title')}
			<div class="flex items-center gap-3">
				<span class="text-xs text-muted-foreground">Format</span>
				<Select.Root type="single" bind:value={prefs.title.style} disabled={!prefs.title.enabled}>
					<Select.Trigger class="w-72">{styles[prefs.title.style]}</Select.Trigger>
					<Select.Content>
						{#each Object.entries(styles) as [value, label] (value)}
							<Select.Item {value} {label} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</section>

		<section class="grid gap-3 border-t pt-5">
			<div class="flex items-center justify-between gap-4">
				<Label for="ts-dot" class="grid gap-0.5">
					<span>Dot on the tab icon</span>
					<span class="text-xs font-normal text-muted-foreground"
						>Safari may ignore icon changes after the page loads.</span
					>
				</Label>
				<Switch id="ts-dot" bind:checked={prefs.favicon.enabled} />
			</div>
			{@render sources('favicon')}
			<div class="flex flex-wrap items-center gap-3">
				<span class="text-xs text-muted-foreground">Color</span>
				<div class="flex gap-1.5" role="radiogroup" aria-label="Dot color">
					{#each Object.entries(DOT_COLORS) as [name, hex] (name)}
						<button
							role="radio"
							aria-checked={prefs.favicon.color === name}
							aria-label={name}
							disabled={!prefs.favicon.enabled}
							class={cn(
								'size-6 rounded-full border-2 border-transparent transition disabled:opacity-40',
								prefs.favicon.color === name && 'border-foreground'
							)}
							style="background:{hex}"
							onclick={() => (prefs.favicon.color = name as DotColor)}
						></button>
					{/each}
				</div>
				<span class="text-xs text-muted-foreground sm:ml-4">Show</span>
				<Select.Root
					type="single"
					bind:value={prefs.favicon.style}
					disabled={!prefs.favicon.enabled}
				>
					<Select.Trigger class="w-32">{dotStyles[prefs.favicon.style]}</Select.Trigger>
					<Select.Content>
						{#each Object.entries(dotStyles) as [value, label] (value)}
							<Select.Item {value} {label} />
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</section>

		<section class="grid gap-3 border-t pt-5">
			<div class="flex items-center justify-between gap-4">
				<Label for="ts-badge" class="grid gap-0.5">
					<span>Badge on the app icon</span>
					<span class="text-xs font-normal text-muted-foreground">
						Only when Hush is installed as an app (Chrome, Edge, Safari on macOS).
						{#if !canBadge}This browser does not support app badges.{/if}
					</span>
				</Label>
				<Switch id="ts-badge" bind:checked={prefs.appBadge.enabled} />
			</div>
			{@render sources('appBadge')}
		</section>
	</Card.Content>
</Card.Root>
