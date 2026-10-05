<script lang="ts">
	import { untrack } from 'svelte';
	import { rowMenus } from '$lib/row-menus.svelte';
	import { keysOf } from '$lib/keys.svelte';
	import ChangeChips from './change-chips.svelte';
	import { newChanges, saidBy } from '$lib/shared/badges';
	import { DEFAULT_SOURCE_IDS } from '$lib/shared/sources';
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
	import Bell from '@lucide/svelte/icons/bell';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Eye from '@lucide/svelte/icons/eye';
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import X from '@lucide/svelte/icons/x';
	import Layers from '@lucide/svelte/icons/layers';
	import SelectMark from './select-mark.svelte';
	import AppMenu from './app-menu.svelte';
	import type { MenuEntry } from '$lib/menu';
	import MarkIcon from './marks/mark-icon.svelte';
	import { MAX_ROW_LABELS } from '$lib/shared/row-parts';
	import type { RowMark } from '$lib/marks';

	let {
		item: i,
		selected = false,
		checked = false,
		selecting = false,
		draggable = true,
		showSections = false,
		sectionNames,
		marks = [],
		hidden = [],
		onopen,
		onhide,
		onmute,
		oncopy,
		onrowclick,
		ontoggle,
		onundomove,
		menu,
		stack
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
		marks?: RowMark[];
		hidden?: string[];
		onopen: (i: DashItem, url: string) => void;
		onhide: (i: DashItem) => void;
		/** Mute (hidden until unmuted, and its threads muted), or unmute. */
		onmute: (i: DashItem) => void;
		oncopy: (i: DashItem) => void;
		onrowclick: (e: MouseEvent) => void;
		ontoggle: (e: MouseEvent) => void;
		onundomove: (i: DashItem) => void;
		/** The "⋯" menu on phones (the same list as the right-click menu). None on the drag ghost. */
		menu?: () => MenuEntry[];
		stack?: { position: number; size: number };
	} = $props();

	// A click on any row closes this row's menus (see row-menus.svelte.ts).
	let menuOpen = $state([false]);
	$effect(() => {
		void rowMenus.epoch;
		untrack(() => (menuOpen = menuOpen.map(() => false)));
	});

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

	/** Labels added since you last looked (the row marks them). */
	const newLabels = $derived(i.changes?.flatMap((c) => c.labels ?? []) ?? []);

	// One fact, one badge: what the reason says, no badge repeats.
	const said = $derived(saidBy(i.turnReason));
	const show = (part: string) => !hidden.includes(part);
	const [owner, repoName] = $derived(i.repo.split('/'));
	const shownMarks = $derived(
		marks.filter((m) => show(m.kind === 'category' ? 'category' : 'tags'))
	);
	/** CI changed since you last looked: a dot on the CI badge (or on the reason, if it is about CI). */
	const ciNew = $derived(!!i.changes?.some((c) => c.kind === 'ci'));
	const changes = $derived(
		newChanges(
			(i.changes ?? []).filter((c) => c.kind !== 'labels' && !(c.kind === 'ci' && ci)),
			said,
			[i.turnReason]
		)
	);
	/** Your own searches say something the reason does not; the built-in ones only repeat it. */
	const sections = $derived(
		showSections
			? i.sections.filter((s) => !DEFAULT_SOURCE_IDS.has(s) && sectionNames[s] !== i.turnReason)
			: []
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

{#snippet newDot()}
	<span
		class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-signal-review"
		aria-label="Changed since you last looked"
	></span>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={row}
	data-row-id={i.id}
	data-selected={selected || undefined}
	data-checked={checked || undefined}
	class={cn(
		'group relative flex items-start gap-2.5 rounded-xl border border-transparent bg-background px-2 py-2.5 transition-colors select-none sm:gap-3 sm:px-3 sm:py-3',
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
		<Avatar.Root class="size-7 sm:size-8">
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
				class="line-clamp-2 text-[0.8125rem] font-medium sm:truncate sm:text-sm"
				onclick={(e) => e.preventDefault()}>{i.title}</a
			>
			{#if show('time') && i.stale}
				<span class="shrink-0 text-xs font-medium text-signal-warn tabular-nums"
					>waiting {since(i.waitingSince)}</span
				>
			{:else if show('time')}
				<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{ago(i.updatedAt)}</span>
			{/if}
		</div>

		<div
			class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:text-[0.8rem]"
		>
			<span class="truncate font-mono text-[0.7rem] sm:text-[0.75rem]"
				><span class="hidden sm:inline">{owner}/</span>{repoName}#{i.number}</span
			>
			{#if show('author')}
				<span class="opacity-50">·</span>
				<span class="max-w-[45%] shrink-0 truncate">@{i.author}</span>
			{/if}
			{#if i.kind === 'pr' && show('size')}
				<span class="hidden opacity-50 sm:inline">·</span>
				<Tooltip.Root>
					<Tooltip.Trigger class="hidden shrink-0 font-mono text-[0.72rem] sm:inline">
						<span class="text-signal-merge">+{i.additions}</span>
						<span class="text-signal-fail">−{i.deletions}</span>
					</Tooltip.Trigger>
					<Tooltip.Content>Size {size}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
			{#if i.comments && show('comments')}
				<span class="flex shrink-0 items-center gap-0.5"
					><MessageSquare class="size-3" />{i.comments}</span
				>
			{/if}
			{#if shownMarks.length}
				<span class="opacity-50">·</span>
				<span class="flex shrink-0 items-center gap-1" aria-label="Category and tags">
					{#each shownMarks as m (m.key)}
						<Tooltip.Root>
							<Tooltip.Trigger
								class="flex size-4 items-center justify-center"
								aria-label={m.kind === 'category' ? `Category: ${m.name}` : `Tag: ${m.name}`}
							>
								<MarkIcon kind={m.kind} color={m.color} icon={m.icon} class="size-3.5" />
							</Tooltip.Trigger>
							<Tooltip.Content
								>{m.kind === 'category' ? 'Category' : 'Tag'}: {m.name}</Tooltip.Content
							>
						</Tooltip.Root>
					{/each}
				</span>
			{/if}
		</div>

		<div
			class="mt-1 flex flex-wrap items-center gap-1 text-[0.68rem] sm:mt-1.5 sm:gap-1.5 sm:text-[0.7rem]"
		>
			<span
				class={cn('relative rounded-md px-1.5 py-0.5 font-medium', turnTone[i.turn])}
				title={ciNew && said.has('ci') ? 'CI changed since you last looked' : undefined}
				>{i.turnReason}{#if ciNew && said.has('ci')}{@render newDot()}{/if}</span
			>
			{#if stack && show('stack')}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span
								{...props}
								class="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground tabular-nums"
							>
								<Layers class="size-3" />{stack.position} of {stack.size}
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content
						>Stack: move down or up with
						<kbd class="opacity-60">{keysOf('dash.stackDown')[0] ?? ''}</kbd>
						<kbd class="opacity-60">{keysOf('dash.stackUp')[0] ?? ''}</kbd></Tooltip.Content
					>
				</Tooltip.Root>
			{/if}
			{#if i.movedByYou && show('moved')}
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
			{#if changes.length && show('changes')}<ChangeChips {changes} />{/if}
			{#if ci && !said.has('ci') && show('ci')}
				<span
					class={cn('relative flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5', ci.tone)}
					title={ciNew ? 'Changed since you last looked' : undefined}
				>
					<ci.icon class="size-3" />{ci.label}
					{#if ciNew}{@render newDot()}{/if}
				</span>
			{/if}
			{#if review && !said.has('review') && show('review')}
				<span class={cn('rounded-md bg-muted px-1.5 py-0.5', review.tone)}>{review.label}</span>
			{/if}
			{#if i.openThreads && !said.has('threads') && show('threads')}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-signal-reply"
					>{i.openThreads} open {i.openThreads === 1 ? 'thread' : 'threads'}</span
				>
			{/if}
			{#if i.mergeable === 'CONFLICTING' && !said.has('conflicts') && show('conflicts')}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-signal-warn">Conflicts</span>
			{/if}
			{#if i.draft && !said.has('draft') && show('draft')}
				<span class="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">Draft</span>
			{/if}
			<!-- A label added since you last looked has a ring (no chip of its own). -->
			{#each show('labels') ? i.labels.slice(0, MAX_ROW_LABELS) : [] as l (l.name)}
				{@const added = newLabels.some((n) => n.toLowerCase() === l.name.toLowerCase())}
				<span
					class={cn(
						'max-w-40 truncate rounded-full px-1.5 py-0.5',
						added && 'ring-2 ring-signal-review ring-offset-1 ring-offset-background'
					)}
					style="background:#{l.color}; color:{ink(l.color)}"
					title={added ? 'Added since you last looked' : undefined}>{l.name}</span
				>
			{/each}
			{#each show('sources') ? sections : [] as s (s)}
				<span
					class="hidden rounded-md border border-dashed px-1.5 py-0.5 text-muted-foreground sm:inline"
					>{sectionNames[s] ?? s}</span
				>
			{/each}
		</div>
	</div>

	<!-- Small screens: every action in one menu. -->
	{#if menu}
		<div class="shrink-0 self-center sm:hidden">
			<DropdownMenu.Root bind:open={menuOpen[0]}>
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
							aria-label={i.muted ? 'Unmute' : 'Mute'}
							onclick={(e) => {
								e.stopPropagation();
								onmute(i);
							}}
						>
							{#if i.muted}<Bell />{:else}<BellOff />{/if}
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content
					>{i.muted ? 'Unmute' : 'Mute: hide until you unmute it'}
					<kbd class="ml-1 opacity-60">{keysOf('dash.mute')[0] ?? ''}</kbd></Tooltip.Content
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
