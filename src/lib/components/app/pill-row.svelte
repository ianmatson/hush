<script lang="ts" module>
	export interface Pill {
		id: string | null;
		label: string;
		count?: number | null;
		dim?: boolean;
	}
</script>

<script lang="ts">
	import { tick, type Component } from 'svelte';
	import { fitItems } from '$lib/fit';
	import { cn } from '$lib/utils';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Check from '@lucide/svelte/icons/check';

	let {
		pills,
		value = $bindable(null),
		label,
		toggle = false,
		action
	}: {
		pills: Pill[];
		value?: string | null;
		label: string;
		toggle?: boolean;
		action?: { label: string; href: string; icon: Component };
	} = $props();

	const GAP = 4;
	const ICON_WIDTH = 28;

	let width = $state(0);
	let measure = $state<HTMLElement | null>(null);
	let widths = $state<number[]>([]);
	$effect(() => {
		void pills.map((p) => `${p.label}${p.count}`).join();
		tick().then(() => {
			if (measure)
				widths = [...measure.querySelectorAll<HTMLElement>('[data-pill]')].map(
					(e) => e.offsetWidth
				);
		});
	});

	const activeIndex = $derived(pills.findIndex((p) => p.id === value));
	const shown = $derived(
		!width || widths.length !== pills.length
			? pills.map((_, k) => k)
			: fitItems(widths, width, {
					gap: GAP,
					moreWidth: action ? 0 : ICON_WIDTH,
					reserved: action ? ICON_WIDTH : 0,
					keep: activeIndex
				})
	);
	const overflow = $derived(pills.filter((_, k) => !shown.includes(k)));

	function pick(id: string | null) {
		value = toggle && value === id ? null : id;
	}
</script>

{#snippet pill(p: Pill, measured: boolean)}
	<button
		type="button"
		role={measured ? undefined : 'tab'}
		aria-selected={measured ? undefined : value === p.id}
		data-pill={measured ? '' : undefined}
		tabindex={measured ? -1 : undefined}
		class={cn(
			'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
			value === p.id
				? 'border-foreground/20 bg-foreground text-background'
				: 'text-muted-foreground hover:bg-muted hover:text-foreground',
			p.dim && value !== p.id && 'opacity-50'
		)}
		onclick={() => pick(p.id)}
	>
		{p.label}
		{#if p.count != null}<span class="tabular-nums opacity-70">{p.count}</span>{/if}
	</button>
{/snippet}

<div class="relative min-w-0" bind:clientWidth={width}>
	<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
		<div bind:this={measure} class="invisible absolute top-0 left-0 flex w-max gap-1">
			{#each pills as p (p.id ?? '')}{@render pill(p, true)}{/each}
		</div>
	</div>
	<div class="flex items-center gap-1" role="tablist" aria-label={label}>
		{#each pills as p, k (p.id ?? '')}
			{#if shown.includes(k)}{@render pill(p, false)}{/if}
		{/each}
		{#if overflow.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="{overflow.length} more"
					title="{overflow.length} more"
				>
					<Ellipsis class="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="min-w-52">
					{#each overflow as p (p.id ?? '')}
						<DropdownMenu.Item
							class={cn('gap-2', p.dim && 'opacity-50')}
							onclick={() => pick(p.id)}
						>
							<Check class={cn('size-4', value !== p.id && 'invisible')} />
							<span class="flex-1 truncate">{p.label}</span>
							{#if p.count != null}<span class="text-xs text-muted-foreground tabular-nums"
									>{p.count}</span
								>{/if}
						</DropdownMenu.Item>
					{/each}
					{#if action}
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href={action.href}><action.icon />{action.label}</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else if action}
			<a
				href={action.href}
				class="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label={action.label}
				title={action.label}><action.icon class="size-3.5" /></a
			>
		{/if}
	</div>
</div>
