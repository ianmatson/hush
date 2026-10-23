<script lang="ts">
	import type { ShownChanges } from '$lib/changes-since-opening.svelte';
	import type { DashItem } from '$lib/shared/types';
	import { since } from '$lib/time';
	import WhyLine from './why-line.svelte';

	let { item, lead, shown }: { item: DashItem; lead: string; shown: ShownChanges } = $props();
</script>

<WhyLine
	{lead}
	text={item.turn === 'none'
		? item.turnReason
		: `${item.turnReason}, for ${since(item.waitingSince)}`}
	changes={shown.changes}
	seenAt={shown.seenAt}
/>
