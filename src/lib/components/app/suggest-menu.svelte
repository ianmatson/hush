<script lang="ts">
	import type { Suggestion } from '$lib/shared/suggest';
	import { cn } from '$lib/utils';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
	import GitMerge from '@lucide/svelte/icons/git-merge';
	import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Users from '@lucide/svelte/icons/users';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/** The list under the caret for "@" and "#" (see comment-box.svelte). */
	let {
		items,
		active,
		loading,
		pos,
		onpick,
		onhover
	}: {
		items: Suggestion[];
		active: number;
		loading: boolean;
		/** On screen (the list is on top of the page, so the peek's edges do not cut it). */
		pos: { x: number; top?: number; bottom?: number };
		onpick: (s: Suggestion) => void;
		onhover: (i: number) => void;
	} = $props();

	/** Move the list to the end of the page. */
	function toBody(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	const ICON = {
		pr: {
			open: GitPullRequest,
			draft: GitPullRequestDraft,
			merged: GitMerge,
			closed: GitPullRequestClosed
		},
		issue: { open: CircleDot, draft: CircleDot, merged: CircleCheck, closed: CircleCheck }
	};
	const TONE = {
		open: 'text-signal-merge',
		draft: 'text-muted-foreground',
		merged: 'text-signal-review',
		closed: 'text-signal-fail'
	};
</script>

<div
	use:toBody
	role="listbox"
	aria-label="Suggestions"
	class="fixed z-50 w-72 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
	style:left="{pos.x}px"
	style:top={pos.top === undefined ? undefined : `${pos.top}px`}
	style:bottom={pos.bottom === undefined ? undefined : `${pos.bottom}px`}
>
	{#if !items.length}
		<p class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
			{#if loading}<LoaderCircle class="size-3 animate-spin" />Looking…{:else}No matches{/if}
		</p>
	{/if}
	{#each items as s, i (s.kind === 'user' ? s.login : s.kind === 'emoji' ? `:${s.shortcode}:` : `${s.repo}#${s.number}`)}
		<button
			type="button"
			role="option"
			aria-selected={i === active}
			class={cn(
				'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
				i === active && 'bg-accent text-accent-foreground'
			)}
			onmousedown={(e) => e.preventDefault()}
			onmousemove={() => onhover(i)}
			onclick={() => onpick(s)}
		>
			{#if s.kind === 'user'}
				{#if s.team}
					<Users class="size-4 shrink-0 text-muted-foreground" />
				{:else if s.avatar}
					<img src={s.avatar} alt="" class="size-4 shrink-0 rounded-full" />
				{:else}
					<span class="size-4 shrink-0 rounded-full bg-muted"></span>
				{/if}
				<span class="shrink-0 font-medium">{s.login}</span>
				{#if s.name}<span class="truncate text-xs text-muted-foreground">{s.name}</span>{/if}
			{:else if s.kind === 'emoji'}
				<span class="w-5 shrink-0 text-center text-base leading-none">{s.emoji}</span>
				<span class="truncate">:{s.shortcode}:</span>
			{:else}
				{@const Icon = ICON[s.type][s.state]}
				<Icon
					class={cn(
						'size-4 shrink-0',
						s.type === 'issue' && s.state === 'closed' ? TONE.merged : TONE[s.state]
					)}
				/>
				<span class="shrink-0 font-mono text-xs text-muted-foreground"
					>{s.repo ?? ''}#{s.number}</span
				>
				<span class="truncate">{s.title}</span>
			{/if}
		</button>
	{/each}
</div>
