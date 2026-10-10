<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { buttonClass, cx } from './demo-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MockAvatar from './mock-avatar.svelte';
	import type { DemoDashItem, DemoSection } from './demo-data';

	let {
		sections,
		selectedId,
		motion,
		onselect,
		onsnooze,
		onmute,
		oncopy,
		onopen
	}: {
		sections: DemoSection[];
		selectedId: string | null;
		motion: number;
		onselect: (item: DemoDashItem) => void;
		onsnooze: (item: DemoDashItem) => void;
		onmute: (item: DemoDashItem) => void;
		oncopy: (item: DemoDashItem) => void;
		onopen: (item: DemoDashItem) => void;
	} = $props();

	type Entry =
		| { kind: 'header'; key: string; section: DemoSection }
		| { kind: 'item'; key: string; item: DemoDashItem };

	let closed = $state<Record<string, boolean>>({});

	const entries = $derived<Entry[]>(
		sections.flatMap((section) => [
			{ kind: 'header' as const, key: `section:${section.key}`, section },
			...(closed[section.key]
				? []
				: section.items.map((item) => ({ kind: 'item' as const, key: item.id, item })))
		])
	);

	const TURN_TONE = {
		yours: 'bg-primary text-primary-foreground',
		team: 'bg-signal-review/15 text-signal-review',
		waiting: 'bg-muted text-muted-foreground',
		other: 'bg-muted text-muted-foreground'
	};
	const CI = {
		pass: { icon: CircleCheck, tone: 'text-signal-merge', label: 'Checks pass' },
		fail: { icon: CircleX, tone: 'text-signal-fail', label: 'Checks fail' },
		running: { icon: CircleDashed, tone: 'text-signal-warn', label: 'Checks running' }
	};
	const REVIEW = {
		approved: { tone: 'text-signal-merge', label: 'Approved' },
		changes: { tone: 'text-signal-fail', label: 'Changes requested' }
	};
	const REASON_SAYS_CI = /\bCI\b/;
	const REASON_SAYS_REVIEW = /approved|changes|ready to merge/i;
	const LIGHT_LABEL_LUMA = 0.6;

	function labelInk(hex: string) {
		const n = parseInt(hex, 16);
		const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return luma > LIGHT_LABEL_LUMA ? '#1a1a1a' : '#fff';
	}
</script>

<ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5" aria-label="Pull requests and issues">
	{#each entries as entry (entry.key)}
		<li
			animate:flip={{ duration: motion * 1.6 }}
			in:fade={{ duration: motion, delay: motion }}
			data-demo-dash-row={entry.kind === 'item' ? entry.item.id : undefined}
		>
			{#if entry.kind === 'header'}
				{@const s = entry.section}
				<button
					type="button"
					class="mt-2 mb-0.5 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left"
					aria-expanded={!closed[s.key]}
					onclick={() => (closed[s.key] = !closed[s.key])}
				>
					<ChevronDown
						class={cx(
							'size-3.5 text-muted-foreground transition-transform',
							closed[s.key] && '-rotate-90'
						)}
					/>
					<span class="text-xs font-semibold tracking-wide uppercase">{s.label}</span>
					<span class="text-xs text-muted-foreground tabular-nums">{s.items.length}</span>
					{#if s.rule}
						<code
							class="ml-auto truncate rounded bg-muted px-1.5 py-px font-mono text-[0.68rem] text-muted-foreground"
							>{s.rule}</code
						>
					{/if}
				</button>
			{:else}
				{@const item = entry.item}
				{@const selected = item.id === selectedId}
				{@const actionTab = selected ? 0 : -1}
				{@const ci = item.ci && !REASON_SAYS_CI.test(item.reason) ? CI[item.ci] : null}
				{@const review =
					item.review && !REASON_SAYS_REVIEW.test(item.reason) ? REVIEW[item.review] : null}
				<div
					data-selected={selected || undefined}
					class={cx(
						'group relative flex items-start gap-1 rounded-xl border border-transparent px-1 transition-colors',
						'hover:bg-muted/50 data-selected:border-border data-selected:bg-muted/60',
						'has-[.row-main:focus-visible]:ring-3 has-[.row-main:focus-visible]:ring-ring/50'
					)}
				>
					<button
						type="button"
						class="row-main flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none"
						aria-current={selected || undefined}
						onclick={() => onselect(item)}
					>
						<MockAvatar person={item.person} size={2} />
						<span class="min-w-0 flex-1">
							<span class="flex items-baseline gap-2">
								<span class="truncate text-sm font-medium">{item.title}</span>
								{#if item.tone === 'stale'}
									<span class="shrink-0 text-xs font-medium text-signal-warn tabular-nums"
										>waiting {item.ago}</span
									>
								{:else}
									<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{item.ago}</span
									>
								{/if}
							</span>
							<span
								class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground"
							>
								<span class="truncate font-mono text-[0.75rem]">{item.repo}#{item.number}</span>
								<span class="opacity-50">·</span>
								<span class="shrink-0 truncate">@{item.person.login}</span>
								{#if item.diff}
									<span class="hidden opacity-50 sm:inline">·</span>
									<span class="hidden shrink-0 font-mono text-[0.72rem] sm:inline">
										<span class="text-signal-merge">+{item.diff.additions}</span>
										<span class="text-signal-fail">−{item.diff.deletions}</span>
									</span>
								{/if}
								{#if item.comments}
									<span class="flex shrink-0 items-center gap-0.5"
										><MessageSquare class="size-3" />{item.comments}</span
									>
								{/if}
							</span>
							<span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem]">
								<span class={cx('rounded-md px-1.5 py-0.5 font-medium', TURN_TONE[item.group])}
									>{item.reason}</span
								>
								{#if ci}
									<span
										class={cx('flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5', ci.tone)}
										><ci.icon class="size-3" />{ci.label}</span
									>
								{/if}
								{#if review}
									<span class={cx('rounded-md bg-muted px-1.5 py-0.5', review.tone)}
										>{review.label}</span
									>
								{/if}
								{#each item.labels ?? [] as label (label.name)}
									<span
										class="rounded-full px-1.5 py-0.5"
										style:background="#{label.color}"
										style:color={labelInk(label.color)}>{label.name}</span
									>
								{/each}
							</span>
						</span>
					</button>

					<div class="flex shrink-0 items-center gap-0.5 self-center pr-2">
						<div
							class="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-selected:opacity-100 focus-within:opacity-100 sm:flex"
						>
							<button
								type="button"
								class={buttonClass('ghost', 'icon-sm')}
								aria-label="Snooze until new activity"
								title="Snooze until new activity (S)"
								tabindex={actionTab}
								onclick={() => onsnooze(item)}><AlarmClock /></button
							>
							<button
								type="button"
								class={buttonClass('ghost', 'icon-sm')}
								aria-label="Mute"
								title="Mute (M)"
								tabindex={actionTab}
								onclick={() => onmute(item)}><BellOff /></button
							>
							<button
								type="button"
								class={buttonClass('ghost', 'icon-sm')}
								aria-label="Copy link"
								title="Copy link (C)"
								tabindex={actionTab}
								onclick={() => oncopy(item)}><Link /></button
							>
						</div>
						<button
							type="button"
							class={buttonClass(
								item.group === 'yours' ? 'default' : 'outline',
								'sm',
								'ml-1 min-w-18 max-sm:hidden'
							)}
							tabindex={actionTab}
							onclick={() => onopen(item)}
						>
							{item.actionLabel}
							<ExternalLink class="opacity-60" />
						</button>
					</div>
				</div>
			{/if}
		</li>
	{/each}
</ul>
