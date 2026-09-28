<script lang="ts">
	import type { ItemDTO } from '$lib/shared/types';
	import ItemList, { type ItemGroup } from '$lib/components/app/item-list.svelte';
	import LaneHead from '$lib/components/app/lane-head.svelte';
	import Hourglass from '@lucide/svelte/icons/hourglass';

	/**
	 * Grouped by whom each item waits on (a person, a team, or CI), the group that waited longest
	 * first; inside a group, the oldest first.
	 */
	function group(items: ItemDTO[]): ItemGroup[] {
		const by = new Map<string, ItemDTO[]>();
		for (const t of items) {
			const who = t.waitingOn ?? t.reason;
			by.set(who, [...(by.get(who) ?? []), t]);
		}
		const oldest = (list: ItemDTO[]) =>
			Math.min(...list.map((t) => (t.waitingSince ? Date.parse(t.waitingSince) : Date.now())));
		const byAge = (a: ItemDTO, b: ItemDTO) =>
			(a.waitingSince ? Date.parse(a.waitingSince) : 0) -
			(b.waitingSince ? Date.parse(b.waitingSince) : 0);
		return [...by]
			.sort(([, a], [, b]) => oldest(a) - oldest(b))
			.map(([who, list]) => ({
				key: who,
				label: list[0].waitingOn ? `Waiting on ${who}` : who,
				hint: list.some((t) => t.stale) ? 'some are stale' : undefined,
				items: [...list].sort(byAge)
			}));
	}
</script>

<svelte:head><title>Waiting · Hush</title></svelte:head>

<main data-page class="mx-auto max-w-4xl px-4 pt-5 pb-24">
	<LaneHead title="Waiting" intro="You did your part. Someone else must act next." />
	<ItemList view="waiting" owner="waiting" {group}>
		{#snippet empty()}
			<div class="flex flex-col items-center gap-2 py-16 text-center">
				<Hourglass class="size-8 text-muted-foreground" />
				<p class="font-medium">Nothing is waiting on others.</p>
				<p class="text-sm text-muted-foreground">
					Your open PRs and questions show here while someone else must act.
				</p>
			</div>
		{/snippet}
	</ItemList>
</main>
