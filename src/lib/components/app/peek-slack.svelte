<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { slackMentionsQuery, slackQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import Hash from '@lucide/svelte/icons/hash';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let { repo, number }: { repo: string; number: number } = $props();

	const slack = createQuery(slackQuery);
	const mentionsConnected = $derived(slack.data?.mentions.connected ?? false);
	const mentions = createQuery(() => ({
		...slackMentionsQuery(repo, number),
		enabled: mentionsConnected
	}));
	const found = $derived(mentions.data?.mentions ?? []);
</script>

{#if mentionsConnected && found.length}
	<section class="grid gap-3">
		<h3 class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
			<Hash class="size-3.5" />Mentioned in Slack ({found.length})
		</h3>
		<ul class="grid gap-2">
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
	</section>
{/if}
