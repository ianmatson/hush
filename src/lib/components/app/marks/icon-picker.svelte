<script lang="ts">
	import { untrack } from 'svelte';
	import type { MarkColor } from '$lib/shared/types';
	import {
		allEmojiOptions,
		allLucideOptions,
		EMOJI,
		LUCIDE_PREFIX,
		searchIcons,
		type MarkIconOption
	} from '$lib/shared/mark-icons';
	import { ALL_LUCIDE_IDS } from '$lib/mark-icon-components';
	import { loadEmojiList } from '$lib/emoji';
	import { MARK_DOT, MARK_TEXT } from '$lib/marks';
	import { MARK_COLORS } from '$lib/shared/categories';
	import { cn } from '$lib/utils';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tabs from '$lib/components/ui/tabs';
	import MarkIcon from './mark-icon.svelte';
	import LucideIcon from './lucide-icon.svelte';

	let {
		icon,
		color,
		label,
		onpick,
		oncolor
	}: {
		icon?: string;
		color: MarkColor;
		label: string;
		onpick: (icon: string | undefined) => void;
		oncolor?: (color: MarkColor) => void;
	} = $props();

	let open = $state(false);
	let query = $state('');
	const tabFor = (current: string | undefined) =>
		current && !current.startsWith(LUCIDE_PREFIX) ? 'emoji' : 'icons';
	let tab = $state<'icons' | 'emoji'>(untrack(() => tabFor(icon)));
	const PAGE = 96;
	const NEAR_BOTTOM_PX = 120;
	const lucideOptions = allLucideOptions(ALL_LUCIDE_IDS);
	let emojiOptions = $state<MarkIconOption[]>(EMOJI);
	let shown = $state(PAGE);
	const icons = $derived(searchIcons(lucideOptions, query));
	const emoji = $derived(searchIcons(emojiOptions, query));

	$effect(() => {
		if (!open) return;
		void loadEmojiList().then((entries) => (emojiOptions = allEmojiOptions(entries)));
	});

	function showMoreNearBottom(e: Event) {
		const el = e.currentTarget as HTMLElement;
		if (el.scrollTop + el.clientHeight > el.scrollHeight - NEAR_BOTTOM_PX) shown += PAGE;
	}

	function pick(next: string | undefined) {
		onpick(next);
		open = false;
		query = '';
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
		aria-label="{label}: icon and colour"
	>
		<MarkIcon {color} {icon} class="size-4" />
	</Popover.Trigger>
	<Popover.Content align="start" class="w-80 p-2">
		{#if oncolor}
			<div class="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Colour">
				{#each MARK_COLORS as c (c)}
					<button
						type="button"
						aria-label={c}
						aria-pressed={c === color}
						class={cn(
							'flex size-7 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:bg-muted',
							c === color && 'bg-muted'
						)}
						onclick={() => oncolor(c)}
					>
						<span
							class={cn(
								'size-3.5 rounded-full',
								MARK_DOT[c],
								c === color && 'ring-2 ring-background ring-offset-1 ring-offset-foreground/50'
							)}
						></span>
					</button>
				{/each}
			</div>
		{/if}
		<Input
			bind:value={query}
			oninput={() => (shown = PAGE)}
			placeholder="Search icons and emoji"
			aria-label="Search icons and emoji"
			class="mb-2 h-8"
		/>
		<Tabs.Root bind:value={tab} onValueChange={() => (shown = PAGE)}>
			<div class="flex items-center justify-between gap-2">
				<Tabs.List>
					<Tabs.Trigger value="icons">Icons</Tabs.Trigger>
					<Tabs.Trigger value="emoji">Emoji</Tabs.Trigger>
				</Tabs.List>
				<button
					type="button"
					class="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={() => pick(undefined)}>None</button
				>
			</div>
			<Tabs.Content value="icons">
				<div
					class="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto pt-2"
					onscroll={showMoreNearBottom}
				>
					{#each icons.slice(0, shown) as o (o.id)}
						<button
							type="button"
							title={o.id}
							aria-label={o.id}
							class={cn(
								'flex size-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:bg-muted',
								icon === `${LUCIDE_PREFIX}${o.id}` &&
									'bg-muted ring-1 ring-foreground/30 ring-inset'
							)}
							onclick={() => pick(`${LUCIDE_PREFIX}${o.id}`)}
						>
							<LucideIcon id={o.id} class={cn('size-4', MARK_TEXT[color])} />
						</button>
					{:else}
						<p class="col-span-8 py-4 text-center text-xs text-muted-foreground">No icons match.</p>
					{/each}
				</div>
			</Tabs.Content>
			<Tabs.Content value="emoji">
				<div
					class="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto pt-2"
					onscroll={showMoreNearBottom}
				>
					{#each emoji.slice(0, shown) as o (o.id)}
						<button
							type="button"
							title={o.keywords}
							aria-label={o.keywords}
							class={cn(
								'flex size-8 items-center justify-center rounded-md text-base outline-none hover:bg-muted focus-visible:bg-muted',
								icon === o.id && 'bg-muted ring-1 ring-foreground/30 ring-inset'
							)}
							onclick={() => pick(o.id)}>{o.id}</button
						>
					{:else}
						<p class="col-span-8 py-4 text-center text-xs text-muted-foreground">No emoji match.</p>
					{/each}
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Popover.Content>
</Popover.Root>
