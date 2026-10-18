<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { cn } from '$lib/utils';
	import { groupByOk, type GroupByOption } from '$lib/shared/grouping';
	import { KEEP_CLOSED_HOURS } from '$lib/shared/closed-items';
	import { SORT_BY, SORT_BY_ORDER, isDefaultSort, isSortBy, sortWithBy } from '$lib/shared/sorting';
	import type { GroupBy, ViewSort, ViewSortDir } from '$lib/shared/types';

	let {
		groupBy,
		groupByName,
		groupByChoices,
		setGroupBy,
		sort,
		setSort,
		editSectionsPath,
		hasSections,
		noProjectAccess,
		keepClosed,
		setKeepClosed,
		closedLabel
	}: {
		groupBy: GroupBy;
		groupByName: string;
		groupByChoices: GroupByOption[];
		setGroupBy: (by: GroupBy) => void;
		sort: ViewSort;
		setSort: (s: ViewSort) => void;
		editSectionsPath: string;
		hasSections: boolean;
		noProjectAccess: boolean;
		keepClosed: boolean;
		setKeepClosed: (on: boolean) => void;
		closedLabel: string;
	} = $props();

	const startsNewKind = (k: number) =>
		k > 0 && groupByChoices[k].kind !== groupByChoices[k - 1].kind;
	const summary = $derived(
		isDefaultSort(sort) ? groupByName : `${groupByName} · ${SORT_BY[sort.by].label}`
	);
	const directions = $derived<{ dir: ViewSortDir; label: string; icon: typeof ArrowUp }[]>([
		{ dir: 'asc', label: SORT_BY[sort.by].ascLabel, icon: ArrowUp },
		{ dir: 'desc', label: SORT_BY[sort.by].descLabel, icon: ArrowDown }
	]);
	const turnFirstApplies = $derived(sort.by !== 'turn');
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" aria-label="Display: {summary}">
				<SlidersHorizontal /><span class="hidden max-w-56 truncate sm:inline">{summary}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="grid w-[22rem] max-w-[calc(100vw-1rem)] gap-4 p-4 text-sm">
		<div class="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
			<span class="text-xs text-muted-foreground">Group by</span>
			<Select.Root
				type="single"
				value={groupBy}
				onValueChange={(v) => groupByOk(v) && setGroupBy(v)}
			>
				<Select.Trigger class="w-full" aria-label="Group by">{groupByName}</Select.Trigger>
				<Select.Content class="max-h-[60vh]">
					{#each groupByChoices as o, k (o.id)}
						{#if startsNewKind(k)}<Select.Separator />{/if}
						<Select.Item value={o.id} label={o.label} />
					{/each}
					{#if noProjectAccess}
						<Select.Separator />
						<p class="px-2 py-1.5 text-xs text-muted-foreground">
							Project status needs project access
						</p>
					{/if}
				</Select.Content>
			</Select.Root>

			<span class="text-xs text-muted-foreground">Sort by</span>
			<Select.Root
				type="single"
				value={sort.by}
				onValueChange={(v) => isSortBy(v) && setSort(sortWithBy(sort, v))}
			>
				<Select.Trigger class="w-full" aria-label="Sort by">{SORT_BY[sort.by].label}</Select.Trigger
				>
				<Select.Content>
					{#each SORT_BY_ORDER as by (by)}
						<Select.Item value={by} label={SORT_BY[by].label} />
					{/each}
				</Select.Content>
			</Select.Root>

			<span class="text-xs text-muted-foreground">Order</span>
			<div class="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5" role="group" aria-label="Order">
				{#each directions as d (d.dir)}
					<button
						type="button"
						class={cn(
							'flex min-w-0 items-center justify-center gap-1 rounded px-2 py-1 text-xs',
							sort.dir === d.dir ? 'bg-background shadow-sm' : 'text-muted-foreground'
						)}
						aria-pressed={sort.dir === d.dir}
						onclick={() => setSort({ ...sort, dir: d.dir })}
					>
						<d.icon class="size-3 shrink-0" />
						<span class="truncate">{d.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<label
			class={cn(
				'flex items-start justify-between gap-3 border-t pt-3',
				!turnFirstApplies && 'opacity-50'
			)}
		>
			<span class="grid gap-0.5">
				<span>Your turn first</span>
				<span class="text-xs text-muted-foreground">
					{turnFirstApplies
						? "In each section: your turn, then your team's, then theirs. The sort orders each part."
						: 'Whose turn already puts your turn first.'}
				</span>
			</span>
			<Switch
				checked={sort.turnFirst}
				disabled={!turnFirstApplies}
				onCheckedChange={(on) => setSort({ ...sort, turnFirst: on })}
			/>
		</label>

		<label class="flex items-start justify-between gap-3 border-t pt-3">
			<span class="grid gap-0.5">
				<span>{closedLabel}</span>
				<span class="text-xs text-muted-foreground">
					Keep them at the end of the list for {KEEP_CLOSED_HOURS} hours after they close.
				</span>
			</span>
			<Switch checked={keepClosed} onCheckedChange={setKeepClosed} />
		</label>

		<Button variant="ghost" size="sm" class="justify-start" onclick={() => goto(editSectionsPath)}>
			<Pencil />
			{hasSections ? 'Edit custom sections…' : 'Make custom sections…'}
		</Button>
	</Popover.Content>
</Popover.Root>
