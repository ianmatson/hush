<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import {
		DEFAULT_TABLE_COLUMNS,
		TABLE_COLUMNS,
		knownTableColumns,
		type TableColumn
	} from '$lib/shared/row-layout';
	import { PREVIEW_MARKS, previewItem } from '$lib/row-preview';
	import { Button } from '$lib/components/ui/button';
	import SavedSwitch from './saved-switch.svelte';
	import * as Card from '$lib/components/ui/card';
	import DashTableRow from '$lib/components/app/dash-table-row.svelte';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	const me = createQuery(meQuery);
	const columns = $derived(me.data?.settings.tableColumns ?? DEFAULT_TABLE_COLUMNS);
	const isDefault = $derived(JSON.stringify(columns) === JSON.stringify(DEFAULT_TABLE_COLUMNS));
	const noop = () => {};

	function toggle(column: TableColumn, on: boolean) {
		const others = columns.filter((c) => c !== column);
		return saveSettings({ tableColumns: knownTableColumns(on ? [...others, column] : others) });
	}
</script>

<Card.Root id="table-columns">
	<Card.Header>
		<Card.Title>Table columns</Card.Title>
		<Card.Action class="row-span-1"
			><Button
				variant="ghost"
				size="xs"
				disabled={isDefault}
				onclick={() => saveSettings({ tableColumns: DEFAULT_TABLE_COLUMNS })}
				><RotateCcw /> Defaults</Button
			></Card.Action
		>
		<Card.Description class="col-span-2"
			>Choose the columns of the table. The avatar and the title always show; click a row to open
			it. When the window is too narrow, columns hide: the author first, the time last.</Card.Description
		>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="overflow-x-auto rounded-xl border">
			<div class="pointer-events-none w-max min-w-full select-none *:last:border-b-0" inert>
				{#each ['pr', 'issue'] as const as kind (kind)}
					<DashTableRow
						item={previewItem(kind)}
						marks={PREVIEW_MARKS}
						{columns}
						onopen={noop}
						onsnooze={noop}
						onmute={noop}
						oncopy={noop}
						onrowclick={noop}
						ontoggle={noop}
						hideColumnsToFit={false}
					/>
				{/each}
			</div>
		</div>

		<div class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
			{#each TABLE_COLUMNS as column (column.id)}
				<label class="flex items-center justify-between gap-3 text-sm">
					<span class="flex gap-1">
						{column.label}
						{#if column.prOnly}<span class="text-muted-foreground">· pull requests</span>{/if}
					</span>
					<SavedSwitch
						checked={columns.includes(column.id)}
						onsave={(on) => toggle(column.id, on)}
					/>
				</label>
			{/each}
		</div>
	</Card.Content>
</Card.Root>
