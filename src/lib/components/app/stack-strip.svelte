<script lang="ts">
	import { keysOf } from '$lib/keys.svelte';
	import type { Stack, StackMember } from '$lib/shared/stacks';
	import type { Turn } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Layers from '@lucide/svelte/icons/layers';

	let {
		stack,
		currentKey,
		onpick
	}: {
		stack: Stack;
		currentKey: string;
		onpick: (m: StackMember) => void;
	} = $props();

	const membersTopFirst = $derived([...stack.membersBottomFirst].reverse());
	const size = $derived(stack.membersBottomFirst.length);
	const positionOf = (m: StackMember) => stack.membersBottomFirst.indexOf(m) + 1;

	const turnDot: Record<Turn, string> = {
		you: 'bg-primary',
		team: 'bg-signal-review',
		them: 'bg-muted-foreground/40',
		none: 'bg-muted-foreground/40'
	};

	function ciOf(m: StackMember) {
		const ci = m.itemInList?.ci;
		if (ci === 'SUCCESS') return { icon: CircleCheck, tone: 'text-signal-merge' };
		if (ci === 'FAILURE' || ci === 'ERROR') return { icon: CircleX, tone: 'text-signal-fail' };
		if (ci === 'PENDING' || ci === 'EXPECTED')
			return { icon: CircleDashed, tone: 'text-signal-warn' };
		return null;
	}
</script>

<section class="border-b px-2 py-2" aria-label="Stack">
	<div class="flex items-center gap-1.5 px-2 pt-0.5 pb-1 text-xs text-muted-foreground">
		<Layers class="size-3.5" />
		<span class="font-medium">Stack of {size}</span>
		<span class="ml-auto shrink-0"
			><kbd class="font-sans">{keysOf('dash.stackDown')[0] ?? ''}</kbd>
			<kbd class="font-sans">{keysOf('dash.stackUp')[0] ?? ''}</kbd> to move</span
		>
	</div>
	<ol class="grid">
		{#each membersTopFirst as m (m.key)}
			{@const current = m.key === currentKey}
			{@const ci = ciOf(m)}
			<li>
				<button
					type="button"
					class={cn(
						'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors',
						current
							? 'bg-muted font-medium text-foreground'
							: 'text-muted-foreground hover:bg-muted/60'
					)}
					aria-current={current || undefined}
					onclick={() => onpick(m)}
				>
					<span class="w-5 shrink-0 text-right tabular-nums opacity-60">{positionOf(m)}</span>
					<span
						class={cn(
							'size-1.5 shrink-0 rounded-full',
							m.itemInList ? turnDot[m.itemInList.turn] : 'border border-muted-foreground/50'
						)}
					></span>
					<span class="shrink-0 font-mono opacity-70">#{m.number}</span>
					<span class="min-w-0 flex-1 truncate">{m.title}</span>
					{#if !m.itemInList}
						<span class="shrink-0 opacity-70">not in this list</span>
					{:else if m.draft}
						<span class="shrink-0 opacity-70">draft</span>
					{/if}
					{#if ci}<ci.icon class={cn('size-3 shrink-0', ci.tone)} />{/if}
				</button>
			</li>
		{/each}
	</ol>
</section>
