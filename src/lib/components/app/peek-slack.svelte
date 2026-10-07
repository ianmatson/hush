<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { slackMentionsQuery, slackQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import Hash from '@lucide/svelte/icons/hash';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let { repo, number }: { repo: string; number: number } = $props();

	const slack = createQuery(slackQuery);
	const mentionsConnected = $derived(slack.data?.mentions.connected ?? false);
	const mentions = createQuery(() => ({
		...slackMentionsQuery(repo, number),
		enabled: mentionsConnected
	}));
	const found = $derived(mentions.data?.mentions ?? []);
	const searching = $derived(mentions.isPending);
	const shown = $derived(mentionsConnected && (searching || found.length > 0));

	let open = $state(false);
	$effect(() => {
		void repo;
		void number;
		open = false;
	});
</script>

{#if shown}
	<section class="grid gap-3">
		<h3 class="text-xs font-medium text-muted-foreground">
			<button
				type="button"
				class="flex items-center gap-1.5 hover:text-foreground disabled:hover:text-muted-foreground"
				aria-expanded={open}
				aria-controls="peek-slack-mentions"
				disabled={searching}
				onclick={() => (open = !open)}
			>
				<ChevronRight class={cn('size-3.5 transition-transform', open && 'rotate-90')} />
				<Hash class="size-3.5" />Mentioned in Slack
				{#if searching}
					<LoaderCircle class="size-3.5 animate-spin" aria-label="Searching Slack" />
				{:else}
					<span
						class="rounded-full bg-muted px-1.5 text-[0.7rem] text-foreground tabular-nums"
						aria-label="{found.length} {found.length === 1 ? 'message' : 'messages'}"
						>{found.length}</span
					>
				{/if}
			</button>
		</h3>
		{#if open && !searching}
			<ul id="peek-slack-mentions" class="grid gap-2">
				{#each found as m (m.permalink)}
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
						<p class="break-words text-muted-foreground">{m.extract}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
