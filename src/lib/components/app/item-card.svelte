<script lang="ts">
	import { ciBadge } from '$lib/ci-badge';
	import { STATE, labelInk, shownStateOf, stateIcon } from '$lib/item-state';
	import { MARK_TEXT, type RowMark } from '$lib/marks';
	import { closedTimeOf } from '$lib/shared/closed-items';
	import { snoozeLabel } from '$lib/shared/item-snooze';
	import type { DashItem } from '$lib/shared/types';
	import { ago, since } from '$lib/time';
	import { cn } from '$lib/utils';
	import * as Avatar from '$lib/components/ui/avatar';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import MarkIcon from './marks/mark-icon.svelte';

	let { item: i, marks }: { item: DashItem; marks: RowMark[] } = $props();

	const turnTone: Record<DashItem['turn'], string> = {
		you: 'bg-primary text-primary-foreground',
		team: 'bg-signal-review/15 text-signal-review',
		them: 'bg-muted text-muted-foreground',
		none: 'bg-muted text-muted-foreground'
	};
	const closedTone: Record<Exclude<DashItem['state'], 'open'>, string> = {
		merged: 'bg-signal-reply/12 text-signal-reply',
		closed: 'bg-signal-fail/12 text-signal-fail'
	};

	const shownState = $derived(STATE[shownStateOf(i)]);
	const StateIcon = $derived(stateIcon(i));
	const reasonTone = $derived(i.state === 'open' ? turnTone[i.turn] : closedTone[i.state]);
	const ci = $derived(ciBadge(i.ci));
	const review = $derived(
		i.reviewDecision === 'APPROVED'
			? { label: 'Approved', tone: 'text-signal-merge' }
			: i.reviewDecision === 'CHANGES_REQUESTED'
				? { label: 'Changes requested', tone: 'text-signal-fail' }
				: null
	);
	const BLANK_LINES = /\n\s*\n/g;
	const description = $derived(i.body.replace(BLANK_LINES, '\n').trim());
	const lastChange = $derived(
		i.state === 'open'
			? { label: 'Updated', at: i.updatedAt }
			: { label: shownState.label, at: closedTimeOf(i) }
	);
	const people = $derived(
		[
			{ label: 'Assignees', logins: i.assignees },
			{ label: 'Reviewers', logins: i.reviewRequests }
		].filter((p) => p.logins.length)
	);
</script>

<div class="grid gap-2.5 text-xs">
	<div class="flex min-w-0 items-center gap-1.5 text-muted-foreground">
		<span
			class={cn(
				'flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-medium',
				shownState.tone
			)}><StateIcon class="size-3" />{shownState.label}</span
		>
		<span class="min-w-0 truncate font-mono text-[0.7rem]">{i.repo}#{i.number}</span>
		<span class="ml-auto shrink-0 tabular-nums">{lastChange.label} {ago(lastChange.at)}</span>
	</div>

	<p class="text-sm leading-snug font-semibold break-words text-foreground">{i.title}</p>

	<div class="flex flex-wrap items-center gap-1 text-[0.7rem]">
		<span class={cn('rounded-md px-1.5 py-0.5 font-medium', reasonTone)}>{i.turnReason}</span>
		{#if i.stale}
			<span class="rounded-md bg-muted px-1.5 py-0.5 font-medium text-signal-warn"
				>Waiting {since(i.waitingSince)}</span
			>
		{/if}
		{#if ci}
			<span class={cn('flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5', ci.tone)}
				><ci.icon class="size-3" />{ci.label}</span
			>
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
		{#if i.muted}
			<span class="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground"
				><BellOff class="size-3" />Muted</span
			>
		{:else if i.snooze}
			<span class="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground"
				><AlarmClock class="size-3" />{snoozeLabel(i.snooze)}</span
			>
		{/if}
	</div>

	{#if description}
		<p class="line-clamp-6 leading-relaxed break-words whitespace-pre-line text-muted-foreground">
			{description}
		</p>
	{:else}
		<p class="text-muted-foreground italic">No description.</p>
	{/if}

	{#if i.labels.length}
		<div class="flex flex-wrap gap-1 text-[0.7rem]">
			{#each i.labels as l (l.name)}
				<span
					class="max-w-full truncate rounded-full px-1.5 py-0.5"
					style:background="#{l.color}"
					style:color={labelInk(l.color)}>{l.name}</span
				>
			{/each}
		</div>
	{/if}

	{#if marks.length}
		<div class="flex flex-wrap gap-1 text-[0.7rem]">
			{#each marks as m (m.key)}
				<span
					class={cn(
						'flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5',
						MARK_TEXT[m.color]
					)}
					><MarkIcon color={m.color} icon={m.icon} class="size-3 shrink-0" /><span class="truncate"
						>{m.group}: {m.name}</span
					></span
				>
			{/each}
		</div>
	{/if}

	<div class="grid gap-1 border-t pt-2.5 text-muted-foreground">
		<div class="flex min-w-0 items-center gap-1.5">
			<Avatar.Root class="size-4 shrink-0">
				<Avatar.Image src={i.authorAvatar} alt="" />
				<Avatar.Fallback class="text-[0.45rem]"
					>{i.author.slice(0, 2).toUpperCase()}</Avatar.Fallback
				>
			</Avatar.Root>
			<span class="min-w-0 truncate"
				><span class="text-foreground">@{i.author}</span> opened {ago(i.createdAt)}</span
			>
			<span class="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
				{#if i.kind === 'pr'}
					<span class="font-mono text-[0.7rem]"
						><span class="text-signal-merge">+{i.additions}</span>
						<span class="text-signal-fail">−{i.deletions}</span></span
					>
				{/if}
				{#if i.comments}
					<span class="flex items-center gap-0.5"><MessageSquare class="size-3" />{i.comments}</span
					>
				{/if}
			</span>
		</div>
		{#each people as p (p.label)}
			<p class="min-w-0 truncate">
				{p.label}: <span class="text-foreground">{p.logins.join(', ')}</span>
			</p>
		{/each}
	</div>
</div>
