<script lang="ts">
	import type { ThreadDTO } from '$lib/shared/types';
	import type { ThreadAction } from '$lib/api';
	import { ago, snoozeOptions } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import KindIcon from './kind-icon.svelte';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let {
		thread: t,
		selected = false,
		onaction,
		onopen,
		onselect
	}: {
		thread: ThreadDTO;
		selected?: boolean;
		onaction: (t: ThreadDTO, action: ThreadAction, body?: unknown) => void;
		onopen: (t: ThreadDTO, url: string) => void;
		onselect: () => void;
	} = $props();

	let row = $state<HTMLElement | null>(null);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});

	const ref = $derived(t.number ? `${t.repo}#${t.number}` : t.repo);
	const isAction = $derived(t.category === 'action');
	const inInbox = $derived(
		t.triage === 'inbox' || (t.triage === 'snoozed' && (t.snoozedUntil ?? 0) <= Date.now())
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<li
	bind:this={row}
	data-selected={selected || undefined}
	class={cn(
		'group relative flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors',
		'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60'
	)}
	onclick={onselect}
	role="option"
	aria-selected={selected}
>
	{#if t.unread}
		<span
			class="absolute top-1/2 left-0.5 size-1.5 -translate-y-1/2 rounded-full bg-signal-review"
			aria-label="Unread"
		></span>
	{/if}

	<KindIcon kind={t.kind} category={t.category} subjectType={t.subjectType} />

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline gap-2">
			<p
				class={cn(
					'truncate text-sm',
					isAction ? 'font-medium' : 'text-foreground/80',
					!t.unread && 'font-normal'
				)}
			>
				{t.summary}
			</p>
			<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{ago(t.updatedAt)}</span>
		</div>
		<a
			href={t.htmlUrl}
			target="_blank"
			rel="noreferrer"
			class="mt-0.5 block truncate text-[0.8rem] text-muted-foreground hover:text-foreground"
			onclick={(e) => {
				e.stopPropagation();
				e.preventDefault();
				onopen(t, t.htmlUrl);
			}}
		>
			<span class="font-mono text-[0.75rem]">{ref}</span>
			<span class="mx-1 opacity-50">·</span>{t.title}
		</a>
		<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
			<span class="rounded-md bg-muted px-1.5 py-0.5">{t.why}</span>
			{#if t.rule}
				<span class="rounded-md border border-dashed px-1.5 py-0.5">rule: {t.rule}</span>
			{/if}
			{#if t.draft}
				<span class="rounded-md bg-muted px-1.5 py-0.5">draft</span>
			{/if}
			{#if t.triage === 'snoozed' && t.snoozedUntil && t.snoozedUntil > Date.now()}
				<span class="rounded-md bg-muted px-1.5 py-0.5"
					>until {new Date(t.snoozedUntil).toLocaleString(undefined, {
						weekday: 'short',
						hour: 'numeric',
						minute: '2-digit'
					})}</span
				>
			{/if}
		</div>
	</div>

	<div class="flex shrink-0 items-center gap-0.5 self-center">
		<div
			class={cn(
				'flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100'
			)}
		>
			{#if inInbox}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Done"
								onclick={(e) => {
									e.stopPropagation();
									onaction(t, 'done');
								}}
							>
								<Check />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Done <kbd class="ml-1 opacity-60">E</kbd></Tooltip.Content>
				</Tooltip.Root>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Snooze"
								onclick={(e: MouseEvent) => e.stopPropagation()}
							>
								<AlarmClock />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>Snooze until</DropdownMenu.Label>
						{#each snoozeOptions() as opt (opt.label)}
							<DropdownMenu.Item onclick={() => onaction(t, 'snooze', { until: opt.until })}
								>{opt.label}</DropdownMenu.Item
							>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Mute thread"
								onclick={(e) => {
									e.stopPropagation();
									onaction(t, 'mute');
								}}
							>
								<BellOff />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Mute thread <kbd class="ml-1 opacity-60">M</kbd></Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					onclick={(e) => {
						e.stopPropagation();
						onaction(
							t,
							t.category === 'muted' ? 'unmute' : t.triage === 'snoozed' ? 'unsnooze' : 'undone'
						);
					}}
				>
					<Undo />
					{t.category === 'muted' ? 'Unmute' : 'Move to inbox'}
				</Button>
			{/if}
		</div>
		<Button
			variant={isAction ? 'default' : 'outline'}
			size="sm"
			class="ml-1 min-w-18"
			onclick={(e) => {
				e.stopPropagation();
				onopen(t, t.actionUrl);
			}}
		>
			{t.actionLabel}
			<ExternalLink class="opacity-60" />
		</Button>
	</div>
</li>
