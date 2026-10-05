<script lang="ts">
	import type { StackMember } from '$lib/shared/stacks';
	import { cn } from '$lib/utils';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Layers from '@lucide/svelte/icons/layers';

	let {
		member,
		position,
		size,
		selected = false,
		onclick
	}: {
		member: StackMember;
		position: number;
		size: number;
		selected?: boolean;
		onclick: () => void;
	} = $props();

	let row = $state<HTMLElement | null>(null);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});
</script>

<button
	bind:this={row}
	type="button"
	data-selected={selected || undefined}
	class={cn(
		'flex w-full items-start gap-3 rounded-xl border border-transparent bg-background px-3 py-3 text-left transition-colors select-none',
		'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60'
	)}
	aria-current={selected || undefined}
	{onclick}
>
	<span
		class="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground"
	>
		<GitPullRequest class="size-3.5" />
	</span>
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm font-medium text-muted-foreground">{member.title}</span>
		<span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground">
			<span class="truncate font-mono text-[0.75rem]">{member.repo}#{member.number}</span>
			<span class="opacity-50">·</span>
			<span class="shrink-0 truncate">@{member.author}</span>
		</span>
		<span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
			<span class="rounded-md bg-muted px-1.5 py-0.5 font-medium">Not in this list</span>
			<span class="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 tabular-nums"
				><Layers class="size-3" />{position} of {size}</span
			>
			{#if member.draft}
				<span class="rounded-md bg-muted px-1.5 py-0.5">Draft</span>
			{/if}
		</span>
	</span>
</button>
