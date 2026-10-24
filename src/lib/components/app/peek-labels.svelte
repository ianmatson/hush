<script lang="ts">
	import { tick } from 'svelte';
	import { fitWithTrailingControl } from '$lib/fit';
	import { canEditFields, itemFieldEditor, shownFields } from '$lib/item-field-editor.svelte';
	import { labelUrl } from '$lib/shared/github-links';
	import { cn } from '$lib/utils';
	import type { PeekDTO } from '$lib/shared/types';
	import * as Popover from '$lib/components/ui/popover';
	import ItemFieldPicker from './item-field-picker.svelte';
	import Tag from '@lucide/svelte/icons/tag';
	import { EMPTY_FIELD_BADGE } from './field-badge';

	let { p }: { p: PeekDTO } = $props();

	const GAP = 4;
	const CHIP =
		'flex h-6 shrink-0 items-center rounded-full border px-2 text-xs whitespace-nowrap group-hover/labels:brightness-95 dark:group-hover/labels:brightness-125';
	const LISTED_CHIP =
		'max-w-full rounded-full border px-2 py-0.5 text-xs break-words hover:brightness-95 dark:hover:brightness-125';
	const MORE =
		'flex h-6 shrink-0 items-center rounded-full border px-2 text-xs font-medium text-foreground';
	const GROUP =
		'group/labels flex max-w-full min-w-0 items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

	const editor = itemFieldEditor(() => p, 'labels');
	const editable = $derived(canEditFields(p));
	const labels = $derived(shownFields(p).labels);

	let room = $state(0);
	let measure = $state<HTMLElement | null>(null);
	let widths = $state<number[]>([]);
	let moreWidth = $state(0);
	$effect(() => {
		void labels.map((l) => l.name).join();
		void room;
		tick().then(() => {
			if (!measure) return;
			widths = [...measure.querySelectorAll<HTMLElement>('[data-chip]')].map((e) => e.offsetWidth);
			moreWidth = measure.querySelector<HTMLElement>('[data-more]')?.offsetWidth ?? 0;
		});
	});

	const measured = $derived(room > 0 && widths.length === labels.length);
	const shownCount = $derived(
		measured
			? fitWithTrailingControl(widths, room, {
					gap: GAP,
					moreWidth,
					controlWidth: 0
				})
			: labels.length
	);
	const hidden = $derived(labels.length - shownCount);
	const summary = $derived(`Labels: ${labels.map((l) => l.name).join(', ')}`);
</script>

{#snippet listedChip(l: { name: string; color: string })}
	<a
		href={labelUrl(p.repo, l.name)}
		target="_blank"
		rel="noreferrer"
		class={LISTED_CHIP}
		style="border-color: #{l.color}80; background: #{l.color}1f">{l.name}</a
	>
{/snippet}

{#snippet shownChips()}
	{#each labels.slice(0, shownCount) as l (l.name)}
		<span data-chip class={CHIP} style="border-color: #{l.color}80; background: #{l.color}1f"
			>{l.name}</span
		>
	{/each}
	{#if hidden}<span class={MORE}>+{hidden}</span>{/if}
{/snippet}

{#if labels.length || editable}
	<div
		class="relative min-w-0 overflow-clip [overflow-clip-margin:3px]"
		bind:clientWidth={room}
		data-peek-labels
	>
		<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			<div bind:this={measure} class="invisible absolute top-0 left-0 flex w-max gap-1">
				{#each labels as l (l.name)}
					<span data-chip class={CHIP}>{l.name}</span>
				{/each}
				<span data-more class={MORE}>+{labels.length}</span>
			</div>
		</div>
		<div class={cn('flex items-center', !measured && labels.length && 'invisible')}>
			{#if editable}
				<ItemFieldPicker
					label="Labels"
					tip={labels.length ? 'Edit labels' : 'Add labels'}
					options={editor.options}
					selected={editor.chosen}
					loading={editor.loading}
					error={editor.error}
					bind:search={editor.search}
					bind:open={editor.open}
					ontoggle={editor.toggle}
					triggerClass={labels.length ? GROUP : EMPTY_FIELD_BADGE}
					triggerLabel={labels.length ? `${summary}. Edit labels` : 'Add labels'}
				>
					{#snippet trigger()}
						{#if labels.length}{@render shownChips()}{:else}<Tag class="size-3.5" />Label{/if}
					{/snippet}
				</ItemFieldPicker>
			{:else}
				<Popover.Root>
					<Popover.Trigger class={GROUP} aria-label={summary}
						>{@render shownChips()}</Popover.Trigger
					>
					<Popover.Content
						align="start"
						class="flex max-h-[min(20rem,var(--bits-popover-content-available-height))] w-72 flex-wrap content-start gap-1 overflow-y-auto p-2"
					>
						{#each labels as l (l.name)}
							{@render listedChip(l)}
						{/each}
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
	</div>
{/if}
