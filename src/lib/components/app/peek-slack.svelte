<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
	import { slackMentionsQuery, slackQuery } from '$lib/queries';
	import type { DashKind } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SlackLogo from './slack-logo.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';

	let {
		repo,
		number,
		kind,
		class: className
	}: { repo: string; number: number; kind: DashKind; class?: string } = $props();

	const slack = createQuery(slackQuery);
	const mentionsConnected = $derived(slack.data?.mentions.connected ?? false);
	const mentions = createInfiniteQuery(() => ({
		...slackMentionsQuery(repo, number, kind),
		enabled: mentionsConnected
	}));
	const found = $derived(mentions.data?.pages.flatMap((p) => p.mentions) ?? []);
	const shown = $derived(mentionsConnected && found.length > 0);
	const slackFailed = $derived(slack.isError && !slack.data);
	const mentionsFailed = $derived(mentionsConnected && mentions.isError && !mentions.data);
	const retrying = $derived(slack.isFetching || mentions.isFetching);
	function retryFirstLoad() {
		if (slackFailed) slack.refetch();
		else mentions.refetch();
	}
	const countLabel = $derived(`${found.length}${mentions.hasNextPage ? '+' : ''}`);
	const label = $derived(
		`Mentioned in Slack: ${countLabel} ${found.length === 1 && !mentions.hasNextPage ? 'message' : 'messages'}`
	);

	const LOAD_AHEAD_PX = 120;
	const APPEAR = $derived({
		x: 8,
		duration: prefersReducedMotion.current ? 0 : 220,
		easing: cubicOut
	});

	let open = $state(false);
	let scroller = $state<HTMLElement | null>(null);
	let sentinel = $state<HTMLElement | null>(null);

	function sentinelNearEnd() {
		if (!scroller || !sentinel) return false;
		const end = scroller.getBoundingClientRect().bottom + LOAD_AHEAD_PX;
		return sentinel.getBoundingClientRect().top < end;
	}

	async function loadMore() {
		if (!mentions.hasNextPage || mentions.isFetchingNextPage || mentions.isFetchNextPageError)
			return;
		await fetchNextPage();
	}

	async function fetchNextPage() {
		const page = await mentions.fetchNextPage();
		if (page.isError) return;
		await tick();
		if (sentinelNearEnd()) loadMore();
	}

	function openInSlackApp(event: MouseEvent, appUrl: string) {
		event.preventDefault();
		location.assign(appUrl);
	}

	$effect(() => {
		if (!scroller || !sentinel) return;
		const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), {
			root: scroller,
			rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px`
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#if mentionsConnected || slackFailed}
	<div class={cn('relative h-5 w-14 shrink-0', className)}>
		{#if slackFailed || mentionsFailed}
			<div class="absolute inset-y-0 right-0 flex items-center">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
								aria-label="Slack mentions did not load. Retry"
								disabled={retrying}
								onclick={retryFirstLoad}
							>
								<SlackLogo class="size-3.5" />
								<RotateCw class={cn('size-3', retrying && 'animate-spin')} />
							</button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Slack mentions did not load. Retry</Tooltip.Content>
				</Tooltip.Root>
			</div>
		{:else if shown}
			<div class="absolute inset-y-0 right-0 flex items-center" in:fly={APPEAR}>
				<Popover.Root bind:open>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps })}
								<Popover.Trigger
									{...tooltipProps}
									class="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label={label}
								>
									<SlackLogo class="size-3.5" />
									<span
										class="rounded-full bg-muted px-1.5 text-[0.7rem] font-medium text-foreground tabular-nums"
										>{countLabel}</span
									>
								</Popover.Trigger>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{label}</Tooltip.Content>
					</Tooltip.Root>
					<Popover.Content align="end" class="grid w-80 grid-cols-1 gap-2 p-2.5 text-sm">
						<div class="flex items-center gap-1.5 px-0.5 text-xs font-medium text-muted-foreground">
							<SlackLogo class="size-3" />Mentioned in Slack
							<span class="ml-auto tabular-nums">{countLabel}</span>
						</div>
						<ul
							bind:this={scroller}
							class="-mx-1 grid max-h-96 grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-1"
						>
							{#each found as m (m.permalink)}
								{@const appUrl = m.appUrl}
								<li>
									<a
										href={appUrl ?? m.permalink}
										target={appUrl ? undefined : '_blank'}
										rel="noreferrer"
										onclick={appUrl ? (e) => openInSlackApp(e, appUrl) : undefined}
										class="grid grid-cols-1 gap-1 rounded-lg bg-muted/50 px-3 py-2 text-[0.8rem] transition-colors hover:bg-muted"
									>
										<span class="flex items-center gap-2 text-xs">
											<span class="truncate font-medium">{m.authorName}</span>
											{#if m.channelName}
												<span class="truncate text-muted-foreground">in #{m.channelName}</span>
											{/if}
											<span class="ml-auto shrink-0 text-muted-foreground tabular-nums"
												>{ago(m.at)}</span
											>
										</span>
										<span class="line-clamp-4 wrap-anywhere text-muted-foreground">{m.extract}</span
										>
									</a>
								</li>
							{/each}
							{#if mentions.hasNextPage && mentions.isFetchNextPageError && !mentions.isFetchingNextPage}
								<li
									class="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground"
								>
									More messages did not load.
									<button
										type="button"
										class="font-medium text-foreground underline-offset-2 hover:underline"
										onclick={fetchNextPage}>Retry</button
									>
								</li>
							{:else if mentions.hasNextPage}
								<li bind:this={sentinel} class="flex justify-center py-1 text-muted-foreground">
									<LoaderCircle class="size-3.5 animate-spin" aria-label="Loading more messages" />
								</li>
							{/if}
						</ul>
					</Popover.Content>
				</Popover.Root>
			</div>
		{/if}
	</div>
{/if}
