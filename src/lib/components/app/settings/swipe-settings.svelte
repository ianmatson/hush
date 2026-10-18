<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { SWIPE_ACTIONS, type SwipePair } from '$lib/shared/swipe';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import SettingSelect from './setting-select.svelte';

	/** Swipe actions on touch screens: one action for each direction, in each list. */
	const me = createQuery(meQuery);
	const swipe = $derived(me.data?.settings.swipe.dash);

	const LIST_LABEL = 'Pull requests and issues';
	const SIDES = [
		{ side: 'right', label: 'Swipe right' },
		{ side: 'left', label: 'Swipe left' }
	] as const;

	function set(side: keyof SwipePair, id: string) {
		if (!swipe || swipe[side] === id) return;
		saveSettings({ swipe: { dash: { ...swipe, [side]: id } } }, 'Saved');
	}
</script>

<section class="grid gap-3">
	<div>
		<h2 class="text-base font-semibold tracking-tight">Swipe actions</h2>
		<p class="text-sm text-muted-foreground">
			On a phone or tablet, swipe a row to the right or to the left. A mouse never swipes.
		</p>
	</div>
	{#if swipe}
		<Card.Root>
			<Card.Header><Card.Title class="text-sm">{LIST_LABEL}</Card.Title></Card.Header>
			<Card.Content class="divide-y">
				{#each SIDES as s (s.side)}
					<SettingRow label={s.label}>
						<SettingSelect
							class="w-52"
							label="{LIST_LABEL}: {s.label}"
							value={swipe[s.side]}
							options={SWIPE_ACTIONS.dash}
							onchange={(id) => set(s.side, id)}
						/>
					</SettingRow>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</section>
