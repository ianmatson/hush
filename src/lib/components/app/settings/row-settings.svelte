<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_ROWS, ROW_KINDS, ROW_PARTS, type RowKind } from '$lib/shared/row-parts';
	import { PREVIEW_MARKS, previewItem } from '$lib/row-preview';
	import { Button } from '$lib/components/ui/button';
	import SavedSwitch from './saved-switch.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import DashRow from '$lib/components/app/dash-row.svelte';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	const me = createQuery(meQuery);
	const rows = $derived(me.data?.settings.rows ?? DEFAULT_ROWS);
	let kind = $state<RowKind>('pr');
	const noop = () => {};

	function toggle(part: string, on: boolean) {
		const hidden = rows[kind].filter((p) => p !== part);
		return saveSettings({ rows: { ...rows, [kind]: on ? hidden : [...hidden, part] } });
	}

	const isDefault = $derived(JSON.stringify(rows[kind]) === JSON.stringify(DEFAULT_ROWS[kind]));
</script>

<Card.Root id="rows">
	<Card.Header>
		<Card.Title>Row contents</Card.Title>
		<Card.Action class="row-span-1"
			><Button
				variant="ghost"
				size="xs"
				disabled={isDefault}
				onclick={() => saveSettings({ rows: { ...rows, [kind]: DEFAULT_ROWS[kind] } })}
				><RotateCcw /> Defaults</Button
			></Card.Action
		>
		<Card.Description class="col-span-2"
			>Choose what each row shows. The title, the repository, the turn, and the main action always
			show.</Card.Description
		>
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
			{#key kind}
				<DashRow
					item={previewItem(kind)}
					marks={PREVIEW_MARKS}
					hidden={rows[kind]}
					onopen={noop}
					onsnooze={noop}
					onmute={noop}
					oncopy={noop}
					onrowclick={noop}
					ontoggle={noop}
					menu={() => []}
				/>
			{/key}
		</div>

		<div class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
			{#each ROW_PARTS[kind] as part (part.id)}
				<label class="flex items-center justify-between gap-3 text-sm">
					<span>{part.label}</span>
					<SavedSwitch
						checked={!rows[kind].includes(part.id)}
						onsave={(on) => toggle(part.id, on)}
					/>
				</label>
			{/each}
		</div>
	</Card.Content>
</Card.Root>
