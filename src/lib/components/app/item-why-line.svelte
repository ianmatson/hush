<script lang="ts">
	import type { DashItem } from '$lib/shared/types';
	import { since } from '$lib/time';
	import WhyLine from './why-line.svelte';

	let { item, lead }: { item: DashItem; lead: string } = $props();

	type SeenChanges = Pick<DashItem, 'id' | 'changes' | 'seenAt'>;
	let changesWhenOpened = $state<SeenChanges | null>(null);
	$effect.pre(() => {
		if (changesWhenOpened?.id === item.id) return;
		changesWhenOpened = { id: item.id, changes: item.changes, seenAt: item.seenAt };
	});

	const shownChanges = $derived<SeenChanges>(
		item.changes?.length || changesWhenOpened?.id !== item.id ? item : changesWhenOpened
	);
</script>

<WhyLine
	{lead}
	text={item.turn === 'none'
		? item.turnReason
		: `${item.turnReason}, for ${since(item.waitingSince)}`}
	changes={shownChanges.changes ?? []}
	seenAt={shownChanges.seenAt ?? null}
/>
