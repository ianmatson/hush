<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { slackMentionsQuery, slackQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import SlackLogo from './slack-logo.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let {
		repo,
		number,
		kind,
		class: className
	}: { repo: string; number: number; kind: 'pr' | 'issue'; class?: string } = $props();

	const PAGE_SIZE = 5;

	const slack = createQuery(slackQuery);
	const mentionsConnected = $derived(slack.data?.mentions.connected ?? false);
	const mentions = createQuery(() => ({
		...slackMentionsQuery(repo, number, kind),
		enabled: mentionsConnected
	}));
	const found = $derived(mentions.data?.mentions ?? []);
	const searching = $derived(mentions.isPending);
	const shown = $derived(mentionsConnected && (searching || found.length > 0));

	let open = $state(false);
	let page = $state(0);
	const pageCount = $derived(Math.max(1, Math.ceil(found.length / PAGE_SIZE)));
	const pageStart = $derived(page * PAGE_SIZE);
	const pageItems = $derived(found.slice(pageStart, pageStart + PAGE_SIZE));
	const label = $derived(
		searching
			? 'Searching Slack'
			: `Mentioned in Slack: ${found.length} ${found.length === 1 ? 'message' : 'messages'}`
	);

	$effect(() => {
		void repo;
		void number;
		open = false;
	});
	$effect(() => {
		if (open) page = 0;
	});
</script>

{#if shown}
	<Popover.Root bind:open>
		<Popover.Trigger
			class={cn(
				'flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:hover:bg-transparent',
				className
			)}
			disabled={searching}
			aria-label={label}
			title={label}
		>
			<SlackLogo class={cn('size-3.5', searching && 'animate-pulse')} />
		</Popover.Trigger>
		<Popover.Content align="end" class="grid w-80 gap-2 p-2.5 text-sm">
			<div class="flex items-center gap-1.5 px-0.5 text-xs font-medium text-muted-foreground">
				<SlackLogo class="size-3" />Mentioned in Slack
				<span class="ml-auto tabular-nums">{found.length}</span>
			</div>
			<ul class="grid gap-2">
				{#each pageItems as m (m.permalink)}
					<li class="grid gap-1 rounded-lg bg-muted/50 px-3 py-2 text-[0.8rem]">
						<div class="flex items-center gap-2 text-xs">
							<span class="truncate font-medium">{m.authorName}</span>
							{#if m.channelName}
								<span class="truncate text-muted-foreground">in #{m.channelName}</span>
							{/if}
							<a
								href={m.permalink}
								target="_blank"
								rel="noreferrer"
								class="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground tabular-nums hover:text-foreground"
								>{ago(m.at)}<ExternalLink class="size-3" /></a
							>
						</div>
						<p class="line-clamp-4 break-words text-muted-foreground">{m.extract}</p>
					</li>
				{/each}
			</ul>
			{#if pageCount > 1}
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Newer messages"
						disabled={page === 0}
						onclick={() => (page -= 1)}><ChevronLeft /></Button
					>
					<span class="tabular-nums"
						>{pageStart + 1}–{pageStart + pageItems.length} of {found.length}</span
					>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Older messages"
						disabled={page >= pageCount - 1}
						onclick={() => (page += 1)}><ChevronRight /></Button
					>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}
