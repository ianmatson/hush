<script lang="ts">
	import { keysOf } from '$lib/keys.svelte';
	import ChangeChips from './change-chips.svelte';
	import type { DashItem } from '$lib/shared/types';
	import { ago, since } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import X from '@lucide/svelte/icons/x';
	import SelectMark from './select-mark.svelte';
	import AppMenu from './app-menu.svelte';
	import type { MenuEntry } from '$lib/menu';

	let {
		item: i,
		selected = false,
		checked = false,
		selecting = false,
		draggable = true,
		showSections = false,
		sectionNames,
		onopen,
		onhide,
		oncopy,
		onrowclick,
		ontoggle,
		onundomove,
		menu
	}: {
		item: DashItem;
		/** The keyboard cursor is on this row. */
		selected?: boolean;
		/** Part of the multi-selection. */
		checked?: boolean;
		/** Some row is checked: show checkboxes on every row. */
		selecting?: boolean;
		draggable?: boolean;
		showSections?: boolean;
		sectionNames: Record<string, string>;
		onopen: (i: DashItem, url: string) => void;
		onhide: (i: DashItem) => void;
		oncopy: (i: DashItem) => void;
		onrowclick: (e: MouseEvent) => void;
		ontoggle: (e: MouseEvent) => void;
		onundomove: (i: DashItem) => void;
		/** The "⋯" menu on phones (the same list as the right-click menu). None on the drag ghost. */
		menu?: () => MenuEntry[];
	} = $props();

	let row = $state<HTMLElement | null>(null);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});

	const size = $derived.by(() => {
		const n = i.additions + i.deletions;
		return n < 10 ? 'XS' : n < 100 ? 'S' : n < 500 ? 'M' : n < 1000 ? 'L' : 'XL';
	});

	const turnTone: Record<DashItem['turn'], string> = {
		you: 'bg-primary text-primary-foreground',
		team: 'bg-signal-review/15 text-signal-review',
		them: 'bg-muted text-muted-foreground',
		none: 'bg-muted text-muted-foreground'
	};

	const ci = $derived(
		i.ci === 'SUCCESS'
			? { icon: CircleCheck, tone: 'text-signal-merge', label: 'Checks pass' }
			: i.ci === 'FAILURE' || i.ci === 'ERROR'
				? { icon: CircleX, tone: 'text-signal-fail', label: 'Checks fail' }
				: i.ci === 'PENDING' || i.ci === 'EXPECTED'
					? { icon: CircleDashed, tone: 'text-signal-warn', label: 'Checks running' }
					: null
	);

	const review = $derived(
		i.reviewDecision === 'APPROVED'
			? { label: 'Approved', tone: 'text-signal-merge' }
			: i.reviewDecision === 'CHANGES_REQUESTED'
				? { label: 'Changes requested', tone: 'text-signal-fail' }
				: null
	);

	/** Black or white text on a GitHub label color. */
	function ink(hex: string) {
		const n = parseInt(hex, 16);
		const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return l > 0.6 ? '#1a1a1a' : '#fff';
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={row}
	data-row-id={i.id}
	data-selected={selected || undefined}
	data-checked={checked || undefined}
	class={cn(
		'group relative flex items-start gap-3 rounded-xl border border-transparent bg-background px-3 py-3 transition-colors select-none',
		'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60',
		'data-checked:border-primary/15 data-checked:bg-primary/[0.06] dark:data-checked:bg-primary/[0.09]',
		i.dismissed && 'opacity-60'
	)}
	onclick={onrowclick}
	role="option"
	tabindex="-1"
	aria-selected={selected || checked}
>
	{#if draggable}
		<!-- A hint only: the whole card drags. Mouse hover on wide screens; touch has no drag. -->
		<span
			aria-hidden="true"
			class="sm:[@media(hover:hover)]:flex\ pointer-events-none absolute top-1/2 -left-5 hidden h-8 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
		>
			<GripVertical class="size-4" />
		</span>
	{/if}
	<SelectMark {checked} {selecting} label="Select {i.title}" {ontoggle}>
		<Avatar.Root class="size-8">
			<Avatar.Image src={i.authorAvatar} alt="" draggable={false} />
			<Avatar.Fallback class="text-[0.65rem]">{i.author.slice(0, 2).toUpperCase()}</Avatar.Fallback>
		</Avatar.Root>
	</SelectMark>

	<div class="min-w-0 flex-1">
		<div class="flex items-baseline gap-2">
			<a
				href={i.url}
				target="_blank"
				rel="noreferrer"
				draggable="false"
				class="line-clamp-2 text-sm font-medium sm:truncate"
				onclick={(e) => e.preventDefault()}>{i.title}</a
			>
			{#if i.stale}
				<span class="shrink-0 text-xs font-medium text-signal-warn tabular-nums"
					>waiting {since(i.waitingSince)}</span
				>
			{:else}
				<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{ago(i.updatedAt)}</span>
			{/if}
		</div>

		<div class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground">
			<span class="truncate font-mono text-[0.75rem]">{i.repo}#{i.number}</span>
			<span class="opacity-50">·</span>
			<span class="max-w-[45%] shrink-0 truncate">@{i.author}</span>
			{#if i.kind === 'pr'}
				<span class="hidden opacity-50 sm:inline">·</span>
				<Tooltip.Root>
					<Tooltip.Trigger class="hidden shrink-0 font-mono text-[0.72rem] sm:inline">
						<span class="text-signal-merge">+{i.additions}</span>
						<span class="text-signal-fail">−{i.deletions}</span>
					</Tooltip.Trigger>
					<Tooltip.Content>Size {size}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			{#if i.comments}
				<span class="flex shrink-0 items-center gap-0.5"
					><MessageSquare class="size-3" />{i.comments}</span
				>
			{/if}
		</div>

		<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem]">
			<span class={cn('rounded-md px-1.5 py-0.5 font-medium', turnTone[i.turn])}
				>{i.turnReason}</span
			>
			{#if i.movedByYou}
				<span
					class="flex items-center gap-0.5 rounded-md border border-dashed py-0.5 pr-0.5 pl-1.5 text-muted-foreground"
				>
					Moved by you
					<button
						class="rounded p-0.5 hover:bg-muted hover:text-foreground"
						aria-label="Undo move"
						onclick={(e) => {
							e.stopPropagation();
							onundomove(i);
						}}><X class="size-3" /></button
					>
				</span>
			{/if}
			{#if i.changes?.length}<ChangeChips changes={i.changes} />{/if}
			{#if ci}
				<span class={cn('flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5', ci.tone)}>
					<ci.icon class="size-3" />{ci.label}
				</span>
			{/if}
			{#if review}
				<span class={cn('rounded-md bg-muted px-1.5 py-0.5', review.tone)}>{review.label}</span>
			{/if}
			{#if i.openThreads}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-signal-reply"
					>{i.openThreads} open {i.openThreads === 1 ? 'thread' : 'threads'}</span
				>
			{/if}
			{#if i.mergeable === 'CONFLICTING'}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-signal-warn">Conflicts</span>
			{/if}
			{#if i.draft}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">Draft</span>
			{/if}
			{#each i.labels.slice(0, 3) as l (l.name)}
				<span
					class="max-w-40 truncate rounded-full px-1.5 py-0.5"
					style="background:#{l.color}; color:{ink(l.color)}">{l.name}</span
				>
			{/each}
			{#if showSections}
				{#each i.sections.filter((s) => sectionNames[s] !== i.turnReason) as s (s)}
					<span
						class="hidden rounded-md border border-dashed px-1.5 py-0.5 text-muted-foreground sm:inline"
						>{sectionNames[s] ?? s}</span
					>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Small screens: every action in one menu. -->
	{#if menu}
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
	{/if}

	<div class={cn('shrink-0 items-center gap-0.5 self-center', menu ? 'hidden sm:flex' : 'flex')}>
		<div
			class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100"
		>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={i.dismissed ? 'Show again' : 'Hide until it changes'}
							onclick={(e) => {
								e.stopPropagation();
								onhide(i);
							}}
						>
							{#if i.dismissed}<Eye />{:else}<EyeOff />{/if}
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					>{i.dismissed ? 'Show again' : 'Hide until it changes'}
					<kbd class="ml-1 opacity-60">{keysOf('dash.hide')[0] ?? ''}</kbd></Tooltip.Content
				>
			</Tooltip.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="Copy link"
							onclick={(e) => {
								e.stopPropagation();
								oncopy(i);
							}}><Link /></Button
						>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					>Copy link <kbd class="ml-1 opacity-60">{keysOf('list.copy')[0] ?? ''}</kbd
					></Tooltip.Content
				>
			</Tooltip.Root>
		</div>
		<Button
			variant={i.turn === 'you' ? 'default' : 'outline'}
			size="sm"
			class="ml-1 min-w-18"
			onclick={(e) => {
				e.stopPropagation();
				onopen(i, i.actionUrl);
			}}
		>
			{i.actionLabel}
			<ExternalLink class="opacity-60" />
		</Button>
	</div>
</div>
