<script lang="ts">
	import { tick } from 'svelte';
	import { fitWithTrailingControl } from '$lib/fit';
	import { canEditFields, itemFieldEditor, shownFields } from '$lib/item-field-editor.svelte';
	import { labelUrl } from '$lib/shared/github-links';
	import type { PeekDTO } from '$lib/shared/types';
	import * as Popover from '$lib/components/ui/popover';
	import ItemFieldPicker from './item-field-picker.svelte';
	import Tag from '@lucide/svelte/icons/tag';

	let { p }: { p: PeekDTO } = $props();

	const GAP = 4;
	const CHIP_LOOK =
		'rounded-full border px-2 py-0.5 text-[0.7rem] hover:brightness-95 dark:hover:brightness-125';
	const CHIP = `${CHIP_LOOK} shrink-0 whitespace-nowrap`;
	const LISTED_CHIP = `${CHIP_LOOK} max-w-full break-words`;
	const BUTTON =
		'flex h-[1.375rem] shrink-0 items-center gap-1 rounded-full px-1.5 text-[0.7rem] whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted data-[state=open]:text-foreground';
	const MORE = `${BUTTON} border px-2 font-medium`;
	const EMPTY = `${BUTTON} border border-dashed px-2`;

	const editor = itemFieldEditor(() => p, 'labels');
	const editable = $derived(canEditFields(p));
	const labels = $derived(shownFields(p).labels);

	let room = $state(0);
	let measure = $state<HTMLElement | null>(null);
	let widths = $state<number[]>([]);
	let moreWidth = $state(0);
	let editWidth = $state(0);
	$effect(() => {
		void labels.map((l) => l.name).join();
		void room;
		tick().then(() => {
			if (!measure) return;
			widths = [...measure.querySelectorAll<HTMLElement>('[data-chip]')].map((e) => e.offsetWidth);
			moreWidth = measure.querySelector<HTMLElement>('[data-more]')?.offsetWidth ?? 0;
			editWidth = measure.querySelector<HTMLElement>('[data-edit]')?.offsetWidth ?? 0;
		});
	});

	const measured = $derived(room > 0 && widths.length === labels.length);
	const shownCount = $derived(
		measured
			? fitWithTrailingControl(widths, room, {
					gap: GAP,
					moreWidth,
					controlWidth: editable ? editWidth : 0
				})
			: labels.length
	);
	const hidden = $derived(labels.length - shownCount);
	const moreText = $derived(`+${hidden} more`);
</script>

{#snippet chip(l: { name: string; color: string }, listed = false)}
	<a
		href={labelUrl(p.repo, l.name)}
		target="_blank"
		rel="noreferrer"
		class={listed ? LISTED_CHIP : CHIP}
		style="border-color: #{l.color}80; background: #{l.color}1f">{l.name}</a
	>
{/snippet}

{#if labels.length || editable}
	<div class="relative min-w-0" bind:clientWidth={room} data-peek-labels>
		<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			<div bind:this={measure} class="invisible absolute top-0 left-0 flex w-max gap-1">
				{#each labels as l (l.name)}
					<span data-chip class={CHIP}>{l.name}</span>
				{/each}
				<span data-more class={MORE}>+{labels.length} more</span>
				<span data-edit class={labels.length ? BUTTON : EMPTY}
					><Tag class="size-3.5" />{#if !labels.length}Label{/if}</span
				>
			</div>
		</div>
		<div class="flex items-center gap-1 overflow-hidden" role="group" aria-label="Labels">
			{#each labels.slice(0, shownCount) as l (l.name)}
				{@render chip(l)}
			{/each}
			{#if editable}
				<ItemFieldPicker
					label="Labels"
					tip={hidden ? 'All labels' : labels.length ? 'Edit labels' : 'Add labels'}
					options={editor.options}
					selected={editor.chosen}
					loading={editor.loading}
					error={editor.error}
					bind:search={editor.search}
					bind:open={editor.open}
					ontoggle={editor.toggle}
					triggerClass={hidden ? MORE : labels.length ? BUTTON : EMPTY}
					triggerLabel={hidden ? `${moreText} labels` : undefined}
				>
					{#snippet trigger()}
						{#if hidden}{moreText}{:else}<Tag class="size-3.5" />{#if !labels.length}Label{/if}{/if}
					{/snippet}
				</ItemFieldPicker>
			{:else if hidden}
				<Popover.Root>
					<Popover.Trigger class={MORE} aria-label="{moreText} labels">{moreText}</Popover.Trigger>
					<Popover.Content
						align="start"
						class="flex max-h-[min(20rem,var(--bits-popover-content-available-height))] w-72 flex-wrap content-start gap-1 overflow-y-auto p-2"
					>
						{#each labels as l (l.name)}
							{@render chip(l, true)}
						{/each}
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>
	</div>
{/if}
