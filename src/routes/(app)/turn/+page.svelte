<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import type { ItemDTO } from '$lib/shared/types';
	import ItemList, { type ItemGroup } from '$lib/components/app/item-list.svelte';
	import LaneHead from '$lib/components/app/lane-head.svelte';
	import FinishedStrip from '$lib/components/app/finished-strip.svelte';
	import WelcomeCard from '$lib/components/app/welcome-card.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	const me = createQuery(meQuery);

	/** People waiting on you first, then your own work; the server already sorted by urgency. */
	function group(items: ItemDTO[]): ItemGroup[] {
		const others = items.filter((t) => t.section !== 'work');
		const work = items.filter((t) => t.section === 'work');
		return [
			{ key: 'others', label: 'People are waiting on you', items: others },
			{ key: 'work', label: 'Your work', items: work }
		].filter((g) => g.items.length);
	}
</script>

<svelte:head><title>Your turn · Hush</title></svelte:head>

<main data-page class="mx-auto max-w-4xl px-4 pt-5 pb-24">
	<LaneHead title="Your turn" intro="Everything where you are the next person who must act." />
	<ItemList view="turn" owner="turn" {group}>
		{#snippet head(data)}
			{#if me.data && !me.data.onboarded}<WelcomeCard />{/if}
			<FinishedStrip items={data?.finished ?? []} />
		{/snippet}
		{#snippet empty()}
			<div class="flex flex-col items-center gap-2 py-16 text-center">
				<CircleCheck class="size-8 text-signal-merge" />
				<p class="font-medium">Nothing is waiting on you.</p>
				<p class="text-sm text-muted-foreground">
					Hush tells you when that changes. <a class="underline" href="/waiting"
						>See what waits on others</a
					>.
				</p>
			</div>
		{/snippet}
	</ItemList>
</main>
