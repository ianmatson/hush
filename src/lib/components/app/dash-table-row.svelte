<script lang="ts">
	import { untrack, type ComponentProps } from 'svelte';
	import { on } from 'svelte/events';
	import { rowMenus } from '$lib/row-menus.svelte';
	import { keysOf } from '$lib/keys.svelte';
	import type { DashItem } from '$lib/shared/types';
	import {
		TABLE_AVATAR_REM,
		fitTableColumns,
		shownTableColumns,
		tableRowMinRem,
		type TableColumn
	} from '$lib/shared/row-layout';
	import { since } from '$lib/time';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';
	import Bell from '@lucide/svelte/icons/bell';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Layers from '@lucide/svelte/icons/layers';
	import Link from '@lucide/svelte/icons/link';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import AppMenu from './app-menu.svelte';
	import MarkList from './marks/mark-list.svelte';
	import type DashRow from './dash-row.svelte';
	import Tip from './tip.svelte';

	type CardRowProps = Omit<ComponentProps<typeof DashRow>, 'hidden'>;

	let {
		item: i,
		columns,
		hideColumnsToFit = true,
		selected = false,
		checked = false,
		selecting = false,
		marks = [],
		onsnooze,
		onmute,
		oncopy,
		onrowclick,
		ontoggle,
		menu,
		stack
	}: CardRowProps & { columns: TableColumn[]; hideColumnsToFit?: boolean } = $props();

	let menuOpen = $state([false]);
	$effect(() => {
		void rowMenus.epoch;
		untrack(() => (menuOpen = menuOpen.map(() => false)));
	});

	let row = $state<HTMLElement | null>(null);
	$effect(() => {
		if (selected) row?.scrollIntoView({ block: 'nearest' });
	});

	const BROWSER_DEFAULT_REM_PX = 16;
	const rem = (n: number) => `${n}rem`;
	const remPx =
		parseFloat(getComputedStyle(document.documentElement).fontSize) || BROWSER_DEFAULT_REM_PX;
	let rowWidthPx = $state(0);
	const chosen = $derived(shownTableColumns(columns));
	const shown = $derived(
		hideColumnsToFit && rowWidthPx ? fitTableColumns(chosen, rowWidthPx / remPx) : chosen
	);
	const minWidth = $derived(hideColumnsToFit ? undefined : rem(tableRowMinRem(shown)));
	const template = $derived(
		[rem(TABLE_AVATAR_REM), 'minmax(0,1fr)', ...shown.map((c) => rem(c.widthRem))].join(' ')
	);
	const repoName = $derived(i.repo.split('/')[1]);

	const reasonTone: Record<DashItem['turn'], string> = {
		you: 'font-medium text-foreground',
		team: 'text-signal-review',
		them: 'text-muted-foreground',
		none: 'text-muted-foreground'
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

	const stop = (e: MouseEvent, act: () => void) => {
		e.stopPropagation();
		act();
	};
</script>

{#snippet rowAction(
	label: string,
	key: string,
	onclick: (e: MouseEvent) => void,
	icon: typeof Link
)}
	{@const Icon = icon}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon-xs" aria-label={label} {onclick}
					><Icon /></Button
				>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content
			>{label} <kbd class="ml-1 opacity-60">{keysOf(key)[0] ?? ''}</kbd></Tooltip.Content
		>
	</Tooltip.Root>
{/snippet}

<div
	bind:this={row}
	bind:clientWidth={rowWidthPx}
	data-row-id={i.id}
	data-selected={selected || undefined}
	data-checked={checked || undefined}
	style:--table-cols={template}
	style:--table-min-width={minWidth}
	class={cn(
		'row group relative flex h-9 items-center gap-2 border-b border-border/50 bg-(--row-bg) px-2 text-[0.8rem] select-none md:grid md:min-w-(--table-min-width) md:grid-cols-(--table-cols)',
		i.dismissed && 'opacity-60'
	)}
	{@attach (node) => on(node, 'click', onrowclick)}
	role="option"
	tabindex="-1"
	aria-selected={selected || checked}
>
	<button
		type="button"
		role="checkbox"
		aria-checked={checked}
		aria-label="Select {i.title}"
		class="group/mark flex size-5 shrink-0 items-center justify-center rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		onclick={(e) => stop(e, () => ontoggle(e))}
	>
		<span
			class={cn(
				'size-4 items-center justify-center rounded border',
				checked
					? 'flex border-primary bg-primary text-primary-foreground'
					: 'border-muted-foreground/50 bg-background',
				!checked && (selecting ? 'flex' : 'hidden group-hover/mark:flex')
			)}
			>{#if checked}<Check class="size-3" />{/if}</span
		>
		<Avatar.Root class={cn('size-5 group-hover/mark:hidden', (checked || selecting) && 'hidden')}>
			<Avatar.Image src={i.authorAvatar} alt="" draggable={false} />
			<Avatar.Fallback class="text-[0.5rem]">{i.author.slice(0, 2).toUpperCase()}</Avatar.Fallback>
		</Avatar.Root>
	</button>

	<span class="flex min-w-0 flex-1 items-center gap-1.5">
		{#if i.unread}<span class="size-1.5 shrink-0 rounded-full bg-signal-review" aria-label="Unread"
			></span>{/if}
		<a
			href={i.url}
			target="_blank"
			rel="noreferrer"
			draggable="false"
			class={cn('truncate', i.unread ? 'font-semibold' : 'font-medium')}
			onclick={(e) => e.preventDefault()}>{i.title}</a
		>
		{#if i.muted}<BellOff class="size-3 shrink-0 text-muted-foreground" aria-label="Muted" />
		{:else if i.snooze}<AlarmClock
				class="size-3 shrink-0 text-muted-foreground"
				aria-label="Snoozed"
			/>{/if}
		{#if stack}
			<span class="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
				><Layers class="size-3" />{stack.position}/{stack.size}</span
			>
		{/if}
	</span>

	{#each shown as column (column.id)}
		{#if column.id === 'reason'}
			<span class={cn('hidden truncate text-xs md:block', reasonTone[i.turn])}>{i.turnReason}</span>
		{:else if column.id === 'repo'}
			<span class="hidden truncate font-mono text-[0.7rem] text-muted-foreground md:block"
				>{repoName}#{i.number}</span
			>
		{:else if column.id === 'author'}
			<span class="hidden truncate text-xs text-muted-foreground md:block">@{i.author}</span>
		{:else if column.id === 'categories'}
			<span class="hidden min-w-0 overflow-hidden md:flex"><MarkList {marks} /></span>
		{:else if column.id === 'categoryNames'}
			<span class="hidden min-w-0 gap-1 overflow-hidden text-[0.7rem] md:flex"
				><MarkList {marks} showNames /></span
			>
		{:else if column.id === 'ci'}
			<span class="hidden md:block">
				{#if ci}<ci.icon class={cn('size-3.5', ci.tone)} aria-label={ci.label} />{/if}
			</span>
		{:else if column.id === 'size'}
			<span class="hidden text-right font-mono text-[0.7rem] tabular-nums md:block">
				{#if i.kind === 'pr'}<span class="text-signal-merge">+{i.additions}</span>
					<span class="text-signal-fail">−{i.deletions}</span>{/if}
			</span>
		{:else if column.id === 'comments'}
			<span
				class="hidden items-center justify-end gap-0.5 text-xs text-muted-foreground tabular-nums md:flex"
			>
				{#if i.comments}<MessageSquare class="size-3" />{i.comments}{/if}
			</span>
		{:else if column.id === 'time'}
			<Tip focusable={false} text={i.stale ? 'Waiting' : 'Updated'}>
				{#snippet children(props)}
					<span
						{...props}
						class={cn(
							'shrink-0 text-right text-xs tabular-nums',
							i.stale ? 'font-medium text-signal-warn' : 'text-muted-foreground'
						)}>{since(i.stale ? i.waitingSince : i.updatedAt)}</span
					>
				{/snippet}
			</Tip>
		{/if}
	{/each}

	<div
		class="absolute top-1/2 right-2 hidden -translate-y-1/2 items-center bg-[linear-gradient(to_right,transparent,var(--row-bg)_1.5rem)] pl-6 md:group-hover:flex"
	>
		{@render rowAction(
			i.dismissed ? 'Wake up' : 'Snooze until new activity',
			'dash.snooze',
			(e) => stop(e, () => onsnooze(i)),
			i.dismissed ? AlarmClockOff : AlarmClock
		)}
		{@render rowAction(
			i.muted ? 'Unmute' : 'Mute',
			'dash.mute',
			(e) => stop(e, () => onmute(i)),
			i.muted ? Bell : BellOff
		)}
		{@render rowAction('Copy link', 'list.copy', (e) => stop(e, () => oncopy(i)), Link)}
	</div>

	{#if menu}
		<div class="shrink-0 sm:hidden">
			<DropdownMenu.Root bind:open={menuOpen[0]}>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-xs"
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
</div>

<style>
	.row {
		--row-bg: var(--background);
	}
	.row:hover {
		--row-bg: color-mix(in oklch, var(--muted) 50%, var(--background));
	}
	.row[data-selected] {
		--row-bg: color-mix(in oklch, var(--muted) 70%, var(--background));
	}
	.row[data-checked] {
		--row-bg: color-mix(in oklch, var(--primary) 8%, var(--background));
	}
</style>
