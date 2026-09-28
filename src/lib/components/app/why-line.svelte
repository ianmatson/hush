<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Change } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import ChangeChips from './change-chips.svelte';

	/**
	 * The top of the peek: why the item is in its list, in plain words ("Needs you: CI failed on
	 * your PR. GitHub: your workflow run. Rule: CI is FYI."), with room for a button.
	 */
	let {
		lead,
		text,
		notes = [],
		changes = [],
		seenAt = null,
		actions
	}: {
		lead: string;
		text: string;
		notes?: (string | null | false | undefined)[];
		/** What changed since you last looked, and when that was. */
		changes?: Change[];
		seenAt?: number | null;
		actions?: Snippet;
	} = $props();

	const end = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
</script>

<div class="flex items-start gap-2 border-b px-4 py-3 text-sm">
	<p class="min-w-0 flex-1 leading-snug">
		<span class="font-medium">{lead}:</span>
		{end(text)}
		{#each notes.filter((n): n is string => !!n) as n (n)}
			<span class="text-muted-foreground">{end(n)}</span>{' '}
		{/each}
	</p>
	{@render actions?.()}
</div>
{#if changes.length}
	<div class="flex flex-wrap items-center gap-1.5 border-b px-4 py-2 text-xs">
		<span class="text-muted-foreground">Since you looked{seenAt ? ` (${ago(seenAt)})` : ''}:</span>
		<ChangeChips {changes} max={8} />
	</div>
{/if}
