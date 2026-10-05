<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_ROWS, ROW_KINDS, ROW_PARTS, type RowKind } from '$lib/shared/row-parts';
	import {
		PREVIEW_MARKS,
		PREVIEW_SOURCE_NAMES,
		PREVIEW_THREAD,
		previewItem
	} from '$lib/row-preview';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import DashRow from '$lib/components/app/dash-row.svelte';
	import ThreadRow from '$lib/components/app/thread-row.svelte';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	const me = createQuery(meQuery);
	const rows = $derived(me.data?.settings.rows ?? DEFAULT_ROWS);
	let kind = $state<RowKind>('pr');
	const noop = () => {};

	function toggle(part: string, on: boolean) {
		const hidden = rows[kind].filter((p) => p !== part);
		void saveSettings({ rows: { ...rows, [kind]: on ? hidden : [...hidden, part] } });
	}

	const isDefault = $derived(JSON.stringify(rows[kind]) === JSON.stringify(DEFAULT_ROWS[kind]));
</script>

<Card.Root id="rows">
	<Card.Header>
		<div class="flex items-start justify-between gap-2">
			<div class="grid gap-1.5">
				<Card.Title>Row contents</Card.Title>
				<Card.Description
					>Choose what each row shows. The title, the repository, the turn, and the main action
					always show.</Card.Description
				>
			</div>
			<Button
				variant="ghost"
				size="xs"
				disabled={isDefault}
				onclick={() => saveSettings({ rows: { ...rows, [kind]: DEFAULT_ROWS[kind] } })}
				><RotateCcw /> Defaults</Button
			>
		</div>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<Tabs.Root bind:value={kind}>
			<Tabs.List>
				{#each ROW_KINDS as k (k.id)}
					<Tabs.Trigger value={k.id}>{k.label}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		<div class="pointer-events-none overflow-hidden rounded-xl border select-none" inert>
			{#if kind === 'thread'}
				<ThreadRow
					thread={PREVIEW_THREAD}
					marks={PREVIEW_MARKS}
					hidden={rows.thread}
					onaction={noop}
					onopen={noop}
					onrowclick={noop}
					ontoggle={noop}
					menu={() => []}
				/>
			{:else}
				{#key kind}
					<DashRow
						item={previewItem(kind)}
						marks={PREVIEW_MARKS}
						hidden={rows[kind]}
						showSections
						sectionNames={PREVIEW_SOURCE_NAMES}
						draggable={false}
						onopen={noop}
						onhide={noop}
						onmute={noop}
						oncopy={noop}
						onrowclick={noop}
						ontoggle={noop}
						onundomove={noop}
					/>
				{/key}
			{/if}
		</div>

		<div class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
			{#each ROW_PARTS[kind] as part (part.id)}
				<label class="flex items-center justify-between gap-3 text-sm">
					<span>{part.label}</span>
					<Switch
						checked={!rows[kind].includes(part.id)}
						onCheckedChange={(on) => toggle(part.id, on)}
					/>
				</label>
			{/each}
		</div>
	</Card.Content>
</Card.Root>
