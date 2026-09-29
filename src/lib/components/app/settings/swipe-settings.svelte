<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { SWIPE_ACTIONS, type SwipeKind } from '$lib/shared/swipe';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import SettingRow from '$lib/components/app/setting-row.svelte';

	/** Swipe actions on touch screens: one action for each direction, in each list. */
	const me = createQuery(meQuery);
	const swipe = $derived(me.data?.settings.swipe);

	const LISTS: { kind: SwipeKind; label: string }[] = [
		{ kind: 'inbox', label: 'Inbox' },
		{ kind: 'dash', label: 'Pull requests and issues' }
	];
	const SIDES = [
		{ side: 'right', label: 'Swipe right' },
		{ side: 'left', label: 'Swipe left' }
	] as const;
	const labelOf = (kind: SwipeKind, id: string) =>
		SWIPE_ACTIONS[kind].find((a) => a.id === id)?.label ?? id;

	function set(kind: SwipeKind, side: 'left' | 'right', id: string) {
		if (!swipe || swipe[kind][side] === id) return;
		saveSettings({ swipe: { ...swipe, [kind]: { ...swipe[kind], [side]: id } } }, 'Saved');
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
		{#each LISTS as l (l.kind)}
			<Card.Root>
				<Card.Header><Card.Title class="text-sm">{l.label}</Card.Title></Card.Header>
				<Card.Content class="divide-y">
					{#each SIDES as s (s.side)}
						<SettingRow label={s.label}>
							<Select.Root
								type="single"
								value={swipe[l.kind][s.side]}
								onValueChange={(v) => set(l.kind, s.side, v)}
							>
								<Select.Trigger class="w-52" aria-label="{l.label}: {s.label}"
									>{labelOf(l.kind, swipe[l.kind][s.side])}</Select.Trigger
								>
								<Select.Content>
									{#each SWIPE_ACTIONS[l.kind] as a (a.id)}
										<Select.Item value={a.id} label={a.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</SettingRow>
					{/each}
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</section>
