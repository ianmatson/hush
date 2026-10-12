<script lang="ts">
	import type { DashKind } from '$lib/shared/types';
	import { cn } from '$lib/utils';

	let {
		kinds,
		shown,
		count,
		onchange
	}: {
		kinds: DashKind[];
		shown: DashKind[];
		count: (kind: DashKind) => number;
		onchange: (shown: DashKind[]) => void;
	} = $props();

	const LABELS: Record<DashKind, string> = { pr: 'PRs', issue: 'Issues' };

	function toggle(kind: DashKind) {
		const on = shown.includes(kind);
		if (on && shown.length === 1) return;
		onchange(
			on ? shown.filter((k) => k !== kind) : kinds.filter((k) => k === kind || shown.includes(k))
		);
	}
</script>

{#if kinds.length > 1}
	<div
		class="inline-flex rounded-lg bg-muted p-0.5 text-xs"
		role="group"
		aria-label="Show pull requests or issues"
	>
		{#each kinds as kind (kind)}
			{@const on = shown.includes(kind)}
			<button
				type="button"
				aria-pressed={on}
				class={cn(
					'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground',
					on && 'bg-background font-medium text-foreground shadow-xs'
				)}
				onclick={() => toggle(kind)}
			>
				{LABELS[kind]}<span class="tabular-nums opacity-60">{count(kind)}</span>
			</button>
		{/each}
	</div>
{/if}
