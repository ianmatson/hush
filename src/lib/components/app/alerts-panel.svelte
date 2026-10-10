<script lang="ts">
	import { untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { alertsQuery, pushDevicesQuery } from '$lib/queries';
	import { alertsSeen, markAlertsSeen } from '$lib/alerts.svelte';
	import { ui } from '$lib/ui.svelte';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import type { AlertDTO } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import SidePanel from './side-panel.svelte';
	import PeekContent from './peek-content.svelte';
	import { noteOpened } from '$lib/recheck';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import BellOff from '@lucide/svelte/icons/bell-off';

	/**
	 * The alert history: every push Hush sent in the last 30 days. A PR or issue opens in the same
	 * panel (a peek, with a way back); other alerts open where the push went.
	 */
	const alerts = createQuery(alertsQuery);
	const devices = createQuery(() => ({ ...pushDevicesQuery(), enabled: ui.alertsOpen }));

	let selected = $state<AlertDTO | null>(null);
	// Dots mark what was new when you opened the panel; the bell counts from then.
	let seenBefore = $state(0);
	$effect(() => {
		if (!ui.alertsOpen) {
			selected = null;
			return;
		}
		seenBefore = untrack(() => alertsSeen.at);
		untrack(() => alerts.refetch());
	});
	$effect(() => {
		const newest = alerts.data?.[0]?.sentAt;
		if (ui.alertsOpen && newest) markAlertsSeen(newest);
	});

	const close = () => (ui.alertsOpen = false);
	function choose(a: AlertDTO) {
		if (a.item) selected = a;
		else {
			noteOpened(a.url);
			window.open(a.url, '_blank', 'noreferrer');
		}
	}
	function onkeydown(e: KeyboardEvent) {
		if (!ui.alertsOpen || e.key !== 'Escape' || e.defaultPrevented) return;
		e.preventDefault();
		if (selected) selected = null;
		else close();
	}
</script>

<svelte:window {onkeydown} />

<SidePanel
	open={ui.alertsOpen}
	onclose={close}
	label="alerts"
	title={selected ? selected.body.split('\n')[0] : 'Alerts'}
>
	{#snippet start(wide)}
		{#if selected}
			<Button variant="ghost" size={wide ? 'sm' : 'default'} onclick={() => (selected = null)}
				><ArrowLeft />Alerts</Button
			>
		{:else}
			<span class="px-2 text-sm font-medium">Alerts</span>
		{/if}
	{/snippet}
	{#snippet actions(size)}
		{#if selected}
			<Button
				variant="ghost"
				{size}
				href={selected.url}
				onclick={() => selected && noteOpened(selected.url)}
				target="_blank"
				rel="noreferrer"
				aria-label="Open on GitHub"><ExternalLink /></Button
			>
		{/if}
	{/snippet}

	{#if selected?.item}
		<PeekContent
			repo={selected.item.repo}
			number={selected.item.number}
			title={selected.body.split('\n')[0]}
		/>
	{:else if alerts.isPending}
		<div class="grid gap-3 p-4">
			{#each [0, 1, 2] as i (i)}
				<div class="grid gap-2">
					<Skeleton class="h-4 w-2/3" />
					<Skeleton class="h-3 w-1/2" />
				</div>
			{/each}
		</div>
	{:else if !alerts.data?.length}
		<div class="flex flex-col items-center px-6 py-16 text-center text-sm">
			<BellOff class="mb-3 size-7 text-muted-foreground" />
			<p class="font-medium">No alerts yet.</p>
			<p class="mt-1 text-muted-foreground">
				{#if devices.data && !devices.data.length}
					Hush keeps each push alert here for 30 days. Turn on push in <a
						class="underline"
						href="/settings/notifications"
						onclick={close}>Settings → Notifications</a
					>.
				{:else}
					Hush keeps each push alert here for 30 days.
				{/if}
			</p>
		</div>
	{:else}
		<ul class="grid grid-cols-[minmax(0,1fr)] p-1.5">
			{#each alerts.data as a (a.id)}
				{@const [line, repo] = a.body.split('\n')}
				<li>
					<button
						type="button"
						class="grid w-full grid-cols-[minmax(0,1fr)] gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
						onclick={() => choose(a)}
					>
						<span class="flex items-center gap-2">
							<span
								class={cn(
									'size-1.5 shrink-0 rounded-full bg-primary',
									a.sentAt <= seenBefore && 'invisible'
								)}
								aria-label={a.sentAt > seenBefore ? 'New' : undefined}
							></span>
							<span class="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
							<span class="shrink-0 text-xs text-muted-foreground">{ago(a.sentAt)}</span>
						</span>
						<span class="truncate pl-3.5 text-sm text-muted-foreground">{line}</span>
						{#if repo}
							<span class="flex min-w-0 items-center gap-2 pl-3.5 text-xs text-muted-foreground">
								<span class="truncate font-mono">{repo}</span>
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</SidePanel>
