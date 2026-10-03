<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { buttonClass, cx } from './demo-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MockAvatar from './mock-avatar.svelte';
	import { DASH_GROUPS, type DemoDashItem } from './demo-data';

	let {
		items,
		sections,
		selectedId,
		motion,
		onselect,
		onhide,
		onmute,
		oncopy,
		onopen
	}: {
		items: DemoDashItem[];
		sections: string[];
		selectedId: string | null;
		motion: number;
		onselect: (item: DemoDashItem) => void;
		onhide: (item: DemoDashItem) => void;
		onmute: (item: DemoDashItem) => void;
		oncopy: (item: DemoDashItem) => void;
		onopen: (item: DemoDashItem) => void;
	} = $props();

	let section = $state<string | null>(null);
	let collapsed = $state<Record<string, boolean>>({ other: true });

	const shown = $derived(section ? items.filter((i) => i.sections.includes(section!)) : items);
	const countIn = (name: string | null) =>
		name ? items.filter((i) => i.sections.includes(name)).length : items.length;
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

<div class="flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Sections">
	{#each [null, ...sections] as name (name ?? 'all')}
		{@const count = countIn(name)}
		<button
			type="button"
			role="tab"
			aria-selected={section === name}
			class={cx(
				'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
				section === name
					? 'border-foreground/20 bg-foreground text-background'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground',
				!count && section !== name && 'opacity-50'
			)}
			onclick={() => (section = section === name ? null : name)}
		>
			{name ?? 'All'}
			<span class="tabular-nums opacity-70">{count}</span>
		</button>
	{/each}
</div>

<div class="mt-3 grid gap-4">
	{#each DASH_GROUPS as group (group.id)}
		{@const rows = shown.filter((i) => i.group === group.id)}
		<section>
			<button
				type="button"
				class="mb-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left"
				aria-expanded={!collapsed[group.id]}
				onclick={() => (collapsed[group.id] = !collapsed[group.id])}
			>
				<ChevronDown
					class={cx(
						'size-3.5 text-muted-foreground transition-transform',
						collapsed[group.id] && '-rotate-90'
					)}
				/>
				<span
					class={cx(
						'text-xs font-semibold tracking-wide uppercase',
						!rows.length && 'text-muted-foreground/70'
					)}>{group.label}</span
				>
				<span class="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
			</button>
			{#if !collapsed[group.id]}
				<ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5" transition:slide={{ duration: motion }}>
					{#each rows as item (item.id)}
						{@const selected = item.id === selectedId}
						{@const actionTab = selected ? 0 : -1}
						{@const ci = item.ci && !REASON_SAYS_CI.test(item.reason) ? CI[item.ci] : null}
						{@const review =
							item.review && !REASON_SAYS_REVIEW.test(item.reason) ? REVIEW[item.review] : null}
						<li
							data-demo-dash-row={item.id}
							animate:flip={{ duration: motion }}
							out:slide={{ duration: motion }}
						>
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
									class="row-main flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-3 text-left outline-none"
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
												<span class="shrink-0 text-xs text-muted-foreground tabular-nums"
													>{item.ago}</span
												>
											{/if}
										</span>
										<span
											class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground"
										>
											<span class="truncate font-mono text-[0.75rem]"
												>{item.repo}#{item.number}</span
											>
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
											<span
												class={cx('rounded-md px-1.5 py-0.5 font-medium', TURN_TONE[item.group])}
												>{item.reason}</span
											>
											{#if ci}
												<span
													class={cx(
														'flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5',
														ci.tone
													)}><ci.icon class="size-3" />{ci.label}</span
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
											aria-label="Hide until it changes"
											title="Hide until it changes (E)"
											tabindex={actionTab}
											onclick={() => onhide(item)}><EyeOff /></button
										>
										<button
											type="button"
											class={buttonClass('ghost', 'icon-sm')}
											aria-label="Mute"
											title="Mute: hide until you unmute it (M)"
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
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>
