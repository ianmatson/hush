<script lang="ts">
	import type { Change } from '$lib/shared/types';
	import { cn } from '$lib/utils';

	/** What changed since you last looked ("+2 commits", "CI fails", "@alice approved"). */
	let { changes, max = 4 }: { changes: Change[]; max?: number } = $props();

	const TONE = {
		good: 'bg-signal-merge/10 text-signal-merge',
		bad: 'bg-signal-fail/10 text-signal-fail',
		none: 'bg-muted'
	};
</script>

{#each changes.slice(0, max) as c (c.kind + c.text)}
	<span class={cn('rounded-md px-1.5 py-0.5', TONE[c.tone ?? 'none'])} title="Since you last looked"
		>{c.text}</span
	>
{/each}
