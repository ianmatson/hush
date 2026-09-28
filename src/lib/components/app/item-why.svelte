<script lang="ts">
	import type { ItemDTO } from '$lib/shared/types';
	import { ago, since } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { keysOf } from '$lib/keys.svelte';

	/**
	 * Why an item is in its lane, in plain words, and what changed since you last looked. With
	 * "Not my turn" (Your turn) or "It is my turn" (the other lanes).
	 */
	let {
		item: t,
		onnotmine,
		onmyturn
	}: { item: ItemDTO; onnotmine?: () => void; onmyturn?: () => void } = $props();

	const LANE: Record<ItemDTO['lane'], string> = {
		turn: 'Your turn',
		waiting: 'Waiting',
		updates: 'Update',
		muted: 'Muted by a rule'
	};
	const why = $derived.by(() => {
		const parts = [t.reason];
		if (t.waitingOn && t.lane === 'waiting') parts.push(`on ${t.waitingOn}`);
		if (t.waitingSince && t.lane !== 'updates') parts.push(`for ${since(t.waitingSince)}`);
		return parts.join(' ');
	});
	const TONE = {
		good: 'bg-signal-merge/10 text-signal-merge',
		bad: 'bg-signal-fail/10 text-signal-fail',
		none: 'bg-muted'
	};
</script>

<div class="grid gap-2 border-b px-4 py-3 text-sm">
	<div class="flex items-start gap-2">
		<p class="min-w-0 flex-1 leading-snug">
			<span class="font-medium">{LANE[t.lane]}:</span>
			{why}.
			{#if t.event}<span class="text-muted-foreground">GitHub: {t.event.toLowerCase()}.</span>{/if}
			{#if t.rule}<span class="text-muted-foreground">Rule: {t.rule}.</span>{/if}
			{#if t.finished}<span class="text-muted-foreground">Hush moved it: {t.finished.note}.</span
				>{:else if t.override}<span class="text-muted-foreground"
					>You moved it here, until it changes.</span
				>{/if}
		</p>
		{#if t.lane === 'turn' && onnotmine}
			<Button
				variant="outline"
				size="xs"
				onclick={onnotmine}
				title="Not my turn ({keysOf('item.notMine')[0] ?? ''})">Not my turn</Button
			>
		{:else if t.lane !== 'turn' && onmyturn}
			<Button
				variant="ghost"
				size="xs"
				onclick={onmyturn}
				title="It is my turn ({keysOf('item.myTurn')[0] ?? ''})">It is my turn</Button
			>
		{/if}
	</div>
	{#if t.changes?.length}
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<span class="text-muted-foreground"
				>Since you looked{t.seenAt ? ` (${ago(t.seenAt)})` : ''}:</span
			>
			{#each t.changes as c (c.kind + c.text)}
				<span class={cn('rounded-md px-1.5 py-0.5', TONE[c.tone ?? 'none'])}>{c.text}</span>
			{/each}
		</div>
	{:else if t.seenAt && !t.unseen}
		<p class="text-xs text-muted-foreground">Nothing new since you looked ({ago(t.seenAt)}).</p>
	{/if}
</div>
