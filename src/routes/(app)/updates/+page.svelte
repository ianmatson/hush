<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { itemsQuery, keys, queryClient } from '$lib/queries';
	import type { ItemDTO } from '$lib/shared/types';
	import ItemList, { type ItemGroup } from '$lib/components/app/item-list.svelte';
	import LaneHead from '$lib/components/app/lane-head.svelte';
	import { Button } from '$lib/components/ui/button';
	import Newspaper from '@lucide/svelte/icons/newspaper';

	const list = createQuery(() => itemsQuery('updates'));

	const day = (iso: string) => {
		const d = new Date(iso);
		const today = new Date();
		const yesterday = new Date(Date.now() - 86_400_000);
		const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
		return same(d, today)
			? 'Today'
			: same(d, yesterday)
				? 'Yesterday'
				: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
	};
	/** By day, newest first (the server sends the newest first). */
	function group(items: ItemDTO[]): ItemGroup[] {
		const out: ItemGroup[] = [];
		for (const t of items) {
			const label = day(t.activityAt);
			const last = out.at(-1);
			if (last?.label === label) last.items.push(t);
			else out.push({ key: label, label, items: [t] });
		}
		return out;
	}

	async function markAllSeen() {
		const keysToSee = (list.data?.items ?? []).filter((t) => t.unseen).map((t) => t.key);
		try {
			for (let i = 0; i < keysToSee.length; i += 20)
				await api.act(keysToSee.slice(i, i + 20), 'seen');
			await queryClient.invalidateQueries({ queryKey: keys.itemsAll });
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
	const unseen = $derived((list.data?.items ?? []).some((t) => t.unseen));
</script>

<svelte:head><title>Updates · Hush</title></svelte:head>

<main data-page class="mx-auto max-w-4xl px-4 pt-5 pb-24">
	<LaneHead
		title="Updates"
		intro="Everything else GitHub told you, for the last 14 days. Read it or ignore it: nothing here needs you."
	>
		{#snippet actions()}
			{#if unseen}<Button variant="ghost" size="sm" onclick={markAllSeen}>Mark all seen</Button
				>{/if}
		{/snippet}
	</LaneHead>
	<ItemList view="updates" owner="updates" {group}>
		{#snippet empty()}
			<div class="flex flex-col items-center gap-2 py-16 text-center">
				<Newspaper class="size-8 text-muted-foreground" />
				<p class="font-medium">No updates.</p>
			</div>
		{/snippet}
	</ItemList>
</main>
