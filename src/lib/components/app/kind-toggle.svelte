<script lang="ts" module>
	import type { DashKind } from '$lib/shared/types';
	export type Showing = DashKind | 'both';
</script>

<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		options,
		value,
		count,
		onchange
	}: {
		options: Showing[];
		value: Showing;
		count: (option: Showing) => number;
		onchange: (option: Showing) => void;
	} = $props();

	const LABELS: Record<Showing, string> = { both: 'All', pr: 'PRs', issue: 'Issues' };
	const ordered = $derived([...options].sort((a, b) => (a === 'both' ? -1 : b === 'both' ? 1 : 0)));
</script>

{#if options.length > 1}
	<div
		class="flex items-center gap-3 px-1 text-sm"
		role="radiogroup"
		aria-label="Show pull requests or issues"
	>
		{#each ordered as option (option)}
			{@const on = option === value}
			<button
				type="button"
				role="radio"
				aria-checked={on}
				class={cn(
					'flex items-baseline gap-1 text-muted-foreground transition-colors hover:text-foreground',
					on && 'font-semibold text-foreground'
				)}
				onclick={() => onchange(option)}
			>
				{LABELS[option]}<span class="text-xs font-normal tabular-nums opacity-60"
					>{count(option)}</span
				>
			</button>
		{/each}
	</div>
{/if}
