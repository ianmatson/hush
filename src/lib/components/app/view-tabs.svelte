<script lang="ts" module>
	export interface ViewTab {
		key: string;
		href: string;
		label: string;
		count: number | null;
		/** Needs you: the count is a strong badge. */
		strong?: boolean;
		active: boolean;
		/** A notification view (menus put a line before the first one). */
		saved?: boolean;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';

	/**
	 * The inbox view tabs. Wide screens show as many tabs as fit and put the rest in "More" (the
	 * active tab always shows). Phones get one menu button, like the page menu in the header.
	 */
	let { tabs, onnew }: { tabs: ViewTab[]; onnew: () => void } = $props();

	let width = $state(0);
	let measure = $state<HTMLElement | null>(null);
	let widths = $state<number[]>([]);
	// Measure every tab at its natural width (a hidden copy), again when the tabs change.
	$effect(() => {
		void tabs.map((t) => `${t.label}${t.count}`).join();
		tick().then(() => {
			if (measure)
				widths = [...measure.querySelectorAll<HTMLElement>('[data-tab]')].map((e) => e.offsetWidth);
		});
	});

	const GAP = 2;
	const PAD = 4;
	const NEW = 28 + GAP;
	const MORE = 76 + GAP;
	/** Indexes of the tabs that fit. */
	const shown = $derived.by(() => {
		if (!width || widths.length !== tabs.length) return tabs.map((_, k) => k);
		const total = widths.reduce((a, w) => a + w + GAP, PAD + NEW);
		if (total <= width) return tabs.map((_, k) => k);
		const room = width - PAD - NEW - MORE;
		const out: number[] = [];
		let used = 0;
		for (let k = 0; k < tabs.length; k++) {
			if (used + widths[k] + GAP > room) break;
			used += widths[k] + GAP;
			out.push(k);
		}
		// The active tab always shows: it takes the last place that fits.
		const active = tabs.findIndex((t) => t.active);
		if (active >= 0 && !out.includes(active)) {
			while (out.length && used + widths[active] + GAP > room) used -= widths[out.pop()!] + GAP;
			out.push(active);
		}
		return out;
	});
	const hidden = $derived(tabs.filter((_, k) => !shown.includes(k)));
	const current = $derived(tabs.find((t) => t.active) ?? tabs[0]);
</script>

{#snippet badge(t: ViewTab)}
	{#if t.count}
		<span
			class={cn(
				'min-w-4.5 rounded-full px-1 text-center text-[0.7rem] tabular-nums',
				t.strong ? 'bg-primary text-primary-foreground' : 'bg-foreground/10'
			)}>{t.count}</span
		>
	{/if}
{/snippet}

{#snippet tab(t: ViewTab)}
	<a
		href={t.href}
		data-tab
		aria-current={t.active ? 'page' : undefined}
		class={cn(
			'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
			t.active && 'bg-background text-foreground shadow-xs'
		)}
	>
		{t.label}{@render badge(t)}
	</a>
{/snippet}

<div class="relative w-full min-w-0 sm:w-auto sm:flex-1" bind:clientWidth={width}>
	<!-- Hidden copy, only to measure each tab's width. -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div
			bind:this={measure}
			class="invisible absolute top-0 left-0 flex w-max gap-0.5 p-0.5 text-sm"
		>
			{#each tabs as t (t.key)}{@render tab(t)}{/each}
		</div>
	</div>

	<!-- Phones: one menu. -->
	<div class="sm:hidden">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex h-9 w-full items-center gap-1.5 rounded-lg bg-muted px-3 text-sm"
				aria-label="Change view"
			>
				<span class="truncate font-medium">{current?.label}</span>
				{#if current}{@render badge(current)}{/if}
				<ChevronDown class="ml-auto size-4 text-muted-foreground" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-(--bits-dropdown-menu-anchor-width) min-w-56">
				{#each tabs as t, k (t.key)}
					{#if t.saved && !tabs[k - 1]?.saved}<DropdownMenu.Separator />{/if}
					<DropdownMenu.Item onclick={() => goto(t.href)} class="gap-2">
						<Check class={cn('size-4', !t.active && 'invisible')} />{t.label}
						<span class="ml-auto">{@render badge(t)}</span>
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={onnew}><Plus />New notification view</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<!-- Wide screens: the tabs that fit, then "More". -->
	<nav
		class="hidden w-fit max-w-full items-center gap-0.5 rounded-lg bg-muted p-0.5 text-sm sm:flex"
		aria-label="Views"
	>
		{#each tabs as t, k (t.key)}
			{#if shown.includes(k)}{@render tab(t)}{/if}
		{/each}
		{#if hidden.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
				>
					More
					{#if hidden.some((t) => t.count)}<span class="size-1.5 rounded-full bg-foreground/40"
						></span>{/if}
					<ChevronDown class="size-3.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-48">
					{#each hidden as t, k (t.key)}
						{#if t.saved && k > 0 && !hidden[k - 1]?.saved}<DropdownMenu.Separator />{/if}
						<DropdownMenu.Item onclick={() => goto(t.href)} class="gap-2">
							{t.label}<span class="ml-auto">{@render badge(t)}</span>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
		<button
			type="button"
			class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
			aria-label="New notification view"
			title="New notification view"
			onclick={onnew}><Plus class="size-4" /></button
		>
	</nav>
</div>
