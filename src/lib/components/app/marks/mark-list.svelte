<script lang="ts">
	import type { RowMark } from '$lib/marks';
	import { MARK_TEXT } from '$lib/marks';
	import { cn } from '$lib/utils';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import MarkIcon from './mark-icon.svelte';

	let {
		marks,
		showNames = false,
		tooltipSuffix = () => ''
	}: {
		marks: RowMark[];
		showNames?: boolean;
		tooltipSuffix?: (m: RowMark) => string;
	} = $props();
</script>

{#snippet markTooltip(m: RowMark)}
	<Tooltip.Content>{m.group}: {m.name}{tooltipSuffix(m)}</Tooltip.Content>
{/snippet}

{#if showNames}
	{#each marks as m (m.key)}
		<Tooltip.Root>
			<Tooltip.Trigger
				class={cn(
					'flex max-w-40 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5',
					MARK_TEXT[m.color]
				)}
				aria-label="{m.group}: {m.name}"
			>
				<MarkIcon color={m.color} icon={m.icon} class="size-3" />
				<span class="truncate">{m.name}</span>
			</Tooltip.Trigger>
			{@render markTooltip(m)}
		</Tooltip.Root>
	{/each}
{:else}
	<span class="flex shrink-0 items-center gap-1" aria-label="Categories">
		{#each marks as m (m.key)}
			<Tooltip.Root>
				<Tooltip.Trigger
					class="flex size-4 items-center justify-center"
					aria-label="{m.group}: {m.name}"
				>
					<MarkIcon color={m.color} icon={m.icon} class="size-3.5" />
				</Tooltip.Trigger>
				{@render markTooltip(m)}
			</Tooltip.Root>
		{/each}
	</span>
{/if}
