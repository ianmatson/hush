<script lang="ts">
	import type { Change } from '$lib/shared/types';
	import { cn } from '$lib/utils';

	/** What changed since you last looked ("+2 commits", "CI fails", "@alice approved"). */
	let {
		changes,
		max = 4,
		omit = []
	}: {
		changes: Change[];
		max?: number;
		/** Texts the row already shows (its reason, for example): no chip says them twice. */
		omit?: string[];
	} = $props();

	const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
	const shown = $derived(changes.filter((c) => !omit.some((o) => same(o, c.text))));

	const TONE = {
		good: 'bg-signal-merge/10 text-signal-merge',
		bad: 'bg-signal-fail/10 text-signal-fail',
		none: 'bg-muted'
	};
</script>

{#each shown.slice(0, max) as c (c.kind + c.text)}
	<span class={cn('rounded-md px-1.5 py-0.5', TONE[c.tone ?? 'none'])} title="Since you last looked"
		>{c.text}</span
	>
{/each}
