<script lang="ts">
	import { keysOf } from '$lib/keys.svelte';
	import type { ItemDTO } from '$lib/shared/types';
	import type { ActionBody, ItemAction } from '$lib/api';
	import { ago, since } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import KindIcon from './kind-icon.svelte';
	import SelectMark from './select-mark.svelte';
	import SnoozeItems from './snooze-items.svelte';
	import AppMenu from './app-menu.svelte';
	import type { MenuEntry } from '$lib/menu';
	import { SNOOZE_EVENTS, alreadyTrue, subjectKind } from '$lib/shared/snooze';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	let {
		item: t,
		selected = false,
		checked = false,
		selecting = false,
		onaction,
		onopen,
		onrowclick,
		ontoggle,
		menu
	}: {
		item: ItemDTO;
		/** The keyboard cursor is on this row. */
		selected?: boolean;
		/** Part of the multi-selection. */
		checked?: boolean;
		/** Some row is checked: show checkboxes on every row. */
		selecting?: boolean;
		onaction: (t: ItemDTO, action: ItemAction, body?: ActionBody) => void;
		onopen: (t: ItemDTO, url: string) => void;
		onrowclick: (e: MouseEvent) => void;
		ontoggle: (e: MouseEvent) => void;
		/** The "⋯" menu on phones (the same list as the right-click menu). */
		menu: () => MenuEntry[];
	} = $props();

	let row = $state<HTMLElement | null>(null);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});

	const ref = $derived(t.number ? `${t.repo}#${t.number}` : t.repo);
	const turn = $derived(t.lane === 'turn');
	const snoozed = $derived(t.state === 'snoozed' && (t.snoozedUntil ?? 0) > Date.now());
	const handled = $derived(t.state === 'done' || t.state === 'muted' || snoozed);
	// The first line: what it needs from you, or on whom it waits.
	const line = $derived(
		t.lane === 'waiting' && t.waitingOn && !t.reason.includes(t.waitingOn)
			? `${t.reason} · ${t.waitingOn}`
			: t.summary
	);
	// How long it has waited (Your turn, Waiting), or when it last changed (Updates).
	const when = $derived(
		(turn || t.lane === 'waiting') && t.waitingSince ? since(t.waitingSince) : ago(t.activityAt)
	);
	const stop = (fn: () => void) => (e: MouseEvent) => {
		e.stopPropagation();
		fn();
	};
	const TONE = {
		good: 'bg-signal-merge/10 text-signal-merge',
		bad: 'bg-signal-fail/10 text-signal-fail',
		none: 'bg-muted'
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={row}
	data-row-id={t.key}
	data-selected={selected || undefined}
	data-checked={checked || undefined}
	class={cn(
		'row group relative flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors select-none',
		'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60',
		'data-checked:border-primary/15 data-checked:bg-primary/[0.06] dark:data-checked:bg-primary/[0.09]'
	)}
	onclick={onrowclick}
	role="option"
	tabindex="-1"
	aria-selected={selected || checked}
>
	<SelectMark {checked} {selecting} label="Select {t.title}" {ontoggle}>
		<!-- Same box as the round icon, so the dot sits on the circle's top-right edge. -->
		<span class="relative block size-8">
			<KindIcon kind={t.needs} lane={t.lane} subjectType={t.subjectType} />
			{#if t.unseen}
				<span
					class="absolute top-0 right-0 size-2.5 rounded-full bg-signal-review ring-2 ring-(--row-bg)"
					aria-label="New since you looked"
				></span>
			{/if}
		</span>
	</SelectMark>

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline gap-2">
			<p
				class={cn(
					'truncate text-sm',
					t.unseen ? 'font-semibold text-foreground' : turn ? 'font-medium' : 'text-foreground/80'
				)}
			>
				{line}
			</p>
			<span
				class={cn(
					'shrink-0 text-xs tabular-nums',
					t.stale ? 'font-medium text-signal-warn' : 'text-muted-foreground'
				)}
				title={t.stale ? 'Waiting longer than your stale limit' : undefined}>{when}</span
			>
		</div>
		<a
			href={t.url}
			target="_blank"
			rel="noreferrer"
			class="mt-0.5 block truncate text-[0.8rem] text-muted-foreground select-text"
			onclick={(e) => e.preventDefault()}
		>
			<span class="font-mono text-[0.75rem]">{ref}</span>
			<span class="mx-1 opacity-50">·</span>{t.title}
		</a>
		<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
			{#if t.changes?.length}
				{#each t.changes.slice(0, 4) as c (c.kind + c.text)}
					<span class={cn('rounded-md px-1.5 py-0.5', TONE[c.tone ?? 'none'])}>{c.text}</span>
				{/each}
			{:else if t.event}
				<span class="rounded-md bg-muted px-1.5 py-0.5">{t.event}</span>
			{/if}
			{#if t.finished}
				<span
					class="flex items-center gap-1 rounded-md bg-signal-merge/10 px-1.5 py-0.5 text-signal-merge"
					><Check class="size-3" />{t.finished.note}</span
				>
			{/if}
			{#if t.override && !t.finished}
				<span class="rounded-md border border-dashed px-1.5 py-0.5"
					>{t.override === 'turn' ? 'You said: my turn' : 'You said: not my turn'}</span
				>
			{/if}
			{#if t.rule}
				<span class="rounded-md border border-dashed px-1.5 py-0.5">rule: {t.rule}</span>
			{/if}
			{#if t.draft}
				<span class="rounded-md bg-muted px-1.5 py-0.5">draft</span>
			{/if}
			{#if t.state === 'done'}
				<span class="rounded-md bg-muted px-1.5 py-0.5">done</span>
			{:else if t.state === 'muted'}
				<span class="rounded-md bg-muted px-1.5 py-0.5">muted</span>
			{:else if snoozed && t.snoozedUntil}
				{@const ev = SNOOZE_EVENTS.find((e) => e.id === t.snoozeEvent)}
				{@const at = new Date(t.snoozedUntil).toLocaleString(undefined, {
					weekday: 'short',
					hour: 'numeric',
					minute: '2-digit'
				})}
				<span class="rounded-md bg-muted px-1.5 py-0.5"
					>{ev ? `snoozed until ${ev.label.toLowerCase()} (or ${at})` : `snoozed until ${at}`}</span
				>
			{/if}
		</div>
	</div>

	<!-- Small screens: every action in one menu. -->
	<div class="shrink-0 self-center sm:hidden">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						aria-label="Actions"
						onclick={(e: MouseEvent) => e.stopPropagation()}><Ellipsis /></Button
					>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				<AppMenu entries={menu()} kind="dropdown" />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<div class="hidden shrink-0 items-center gap-0.5 self-center sm:flex">
		<div
			class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100"
		>
			{#if !handled}
				{#if t.lane !== 'updates'}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="Done"
									onclick={stop(() => onaction(t, 'done'))}
								>
									<Check />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content
							>Done: until it is your turn again <kbd class="ml-1 opacity-60"
								>{keysOf('item.done')[0] ?? ''}</kbd
							></Tooltip.Content
						>
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
						<DropdownMenu.Content align="end" class="w-56">
							<SnoozeItems
								subjects={[subjectKind(t.subjectType)]}
								disabled={alreadyTrue({ ci: t.ci, state: t.prState })}
								onpick={(b) => onaction(t, 'snooze', b)}
							/>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Mute"
								onclick={stop(() => onaction(t, 'mute'))}
							>
								<BellOff />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content
						>Mute <kbd class="ml-1 opacity-60">{keysOf('item.mute')[0] ?? ''}</kbd></Tooltip.Content
					>
				</Tooltip.Root>
			{:else}
				<Button variant="ghost" size="sm" onclick={stop(() => onaction(t, 'restore'))}>
					<Undo />
					{t.state === 'muted' ? 'Unmute' : 'Move back'}
				</Button>
			{/if}
		</div>
		<Button
			variant={turn ? 'default' : 'outline'}
			size="sm"
			class="ml-1 min-w-18"
			onclick={stop(() => onopen(t, t.actionUrl))}
		>
			{t.actionLabel}
			<ExternalLink class="opacity-60" />
		</Button>
	</div>
</div>

<style>
	/* The dot's ring matches the row background in every state. */
	.row {
		--row-bg: var(--background);
	}
	.row:hover {
		--row-bg: color-mix(in oklch, var(--muted) 50%, var(--background));
	}
	.row[data-selected] {
		--row-bg: color-mix(in oklch, var(--muted) 60%, var(--background));
	}
	.row[data-checked] {
		--row-bg: color-mix(in oklch, var(--primary) 6%, var(--background));
	}
</style>
