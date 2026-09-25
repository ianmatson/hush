<script lang="ts">
	import type { ThreadDTO } from '$lib/shared/types';
	import type { ThreadAction } from '$lib/api';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import KindIcon from './kind-icon.svelte';
	import SelectMark from './select-mark.svelte';
	import SnoozeItems from './snooze-items.svelte';
	import SnoozeSheet from './snooze-sheet.svelte';
	import { SNOOZE_EVENTS, alreadyTrue, subjectKind } from '$lib/shared/snooze';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Link from '@lucide/svelte/icons/link';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';

	let {
		thread: t,
		selected = false,
		checked = false,
		selecting = false,
		onaction,
		onopen,
		onrowclick,
		ontoggle,
		oncopy,
		onpeek
	}: {
		thread: ThreadDTO;
		/** The keyboard cursor is on this row. */
		selected?: boolean;
		/** Part of the multi-selection. */
		checked?: boolean;
		/** Some row is checked: show checkboxes on every row. */
		selecting?: boolean;
		onaction: (t: ThreadDTO, action: ThreadAction, body?: unknown) => void;
		onopen: (t: ThreadDTO, url: string) => void;
		onrowclick: (e: MouseEvent) => void;
		ontoggle: (e: MouseEvent) => void;
		oncopy: (t: ThreadDTO) => void;
		/** Only for PRs and issues. */
		onpeek?: (t: ThreadDTO) => void;
	} = $props();

	let row = $state<HTMLElement | null>(null);
	let snoozeOpen = $state(false);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});

	const ref = $derived(t.number ? `${t.repo}#${t.number}` : t.repo);
	const isAction = $derived(t.category === 'action');
	const inInbox = $derived(
		t.triage === 'inbox' || (t.triage === 'snoozed' && (t.snoozedUntil ?? 0) <= Date.now())
	);
	const stop = (fn: () => void) => (e: MouseEvent) => {
		e.stopPropagation();
		fn();
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={row}
	data-row-id={t.id}
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
			<KindIcon kind={t.kind} category={t.category} subjectType={t.subjectType} />
			{#if t.unread}
				<span
					class="absolute top-0 right-0 size-2.5 rounded-full bg-signal-review ring-2 ring-(--row-bg)"
					aria-label="Unread"
				></span>
			{/if}
		</span>
	</SelectMark>

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline gap-2">
			<p
				class={cn(
					'truncate text-sm',
					t.unread
						? 'font-semibold text-foreground'
						: isAction
							? 'font-medium'
							: 'text-foreground/80'
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
			class="mt-0.5 block truncate text-[0.8rem] text-muted-foreground select-text"
			onclick={(e) => e.preventDefault()}
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
				{@const ev = SNOOZE_EVENTS.find((e) => e.id === t.snoozeEvent)}
				{@const at = new Date(t.snoozedUntil).toLocaleString(undefined, {
					weekday: 'short',
					hour: 'numeric',
					minute: '2-digit'
				})}
				<span class="rounded-md bg-muted px-1.5 py-0.5"
					>{ev ? `until ${ev.label.toLowerCase()} (or ${at})` : `until ${at}`}</span
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
				{#if onpeek && t.number}
					<DropdownMenu.Item onclick={() => onpeek(t)}><PanelRightOpen />Peek</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item onclick={() => onopen(t, t.actionUrl)}
					><ExternalLink />{t.actionLabel}</DropdownMenu.Item
				>
				{#if t.htmlUrl !== t.actionUrl}
					<DropdownMenu.Item onclick={() => onopen(t, t.htmlUrl)}
						><ExternalLink />Open on GitHub</DropdownMenu.Item
					>
				{/if}
				<DropdownMenu.Separator />
				{#if inInbox}
					<DropdownMenu.Item onclick={() => onaction(t, 'done')}><Check />Done</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => (snoozeOpen = true)}
						><AlarmClock />Snooze…</DropdownMenu.Item
					>
					<DropdownMenu.Item onclick={() => onaction(t, 'mute')}><BellOff />Mute</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item
						onclick={() =>
							onaction(
								t,
								t.category === 'muted' ? 'unmute' : t.triage === 'snoozed' ? 'unsnooze' : 'undone'
							)}><Undo />{t.category === 'muted' ? 'Unmute' : 'Move to inbox'}</DropdownMenu.Item
					>
				{/if}
				<DropdownMenu.Item onclick={() => onaction(t, t.unread ? 'read' : 'unread')}>
					{#if t.unread}<MailOpen />Mark as read{:else}<Mail />Mark as unread{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => oncopy(t)}><Link />Copy link</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<div class="hidden shrink-0 items-center gap-0.5 self-center sm:flex">
		<div
			class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100"
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
								onclick={stop(() => onaction(t, 'done'))}
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
					<DropdownMenu.Content align="end" class="w-56">
						<SnoozeItems
							subjects={[subjectKind(t.subjectType)]}
							disabled={alreadyTrue(t)}
							onpick={(b) => onaction(t, 'snooze', b)}
						/>
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
								onclick={stop(() => onaction(t, 'mute'))}
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
					onclick={stop(() =>
						onaction(
							t,
							t.category === 'muted' ? 'unmute' : t.triage === 'snoozed' ? 'unsnooze' : 'undone'
						)
					)}
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
			onclick={stop(() => onopen(t, t.actionUrl))}
		>
			{t.actionLabel}
			<ExternalLink class="opacity-60" />
		</Button>
	</div>
	<SnoozeSheet
		bind:open={snoozeOpen}
		subjects={[subjectKind(t.subjectType)]}
		disabled={alreadyTrue(t)}
		onpick={(b) => onaction(t, 'snooze', b)}
	/>
</div>

<style>
	/* The unread dot's ring matches the row background in every state. */
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
