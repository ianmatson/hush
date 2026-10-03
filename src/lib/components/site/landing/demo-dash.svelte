<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { cx } from './demo-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import MockAvatar from './mock-avatar.svelte';
	import { DASH_GROUPS, type DemoDashItem } from './demo-data';

	let {
		items,
		sections,
		selectedId,
		motion,
		onselect
	}: {
		items: DemoDashItem[];
		sections: string[];
		selectedId: string | null;
		motion: number;
		onselect: (item: DemoDashItem) => void;
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
						<li animate:flip={{ duration: motion }} out:slide={{ duration: motion }}>
							<button
								type="button"
								data-selected={item.id === selectedId || undefined}
								aria-current={item.id === selectedId || undefined}
								class={cx(
									'flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors outline-none',
									'hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 data-selected:border-border data-selected:bg-muted/60'
								)}
								onclick={() => onselect(item)}
							>
								<MockAvatar person={item.person} size={2} />
								<span class="min-w-0 flex-1">
									<span class="flex items-baseline gap-2">
										<span class="truncate text-sm font-medium">{item.title}</span>
										{#if item.tone === 'stale'}
											<span class="shrink-0 text-xs font-medium text-signal-warn tabular-nums"
												>waiting 5d</span
											>
										{/if}
									</span>
									<span
										class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground"
									>
										<span class="truncate font-mono text-[0.75rem]">{item.repo}#{item.number}</span>
										<span class="opacity-50">·</span>
										<span class="shrink-0 truncate">@{item.person.login}</span>
									</span>
									<span class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem]">
										<span class={cx('rounded-md px-1.5 py-0.5 font-medium', TURN_TONE[item.group])}
											>{item.reason}</span
										>
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>
