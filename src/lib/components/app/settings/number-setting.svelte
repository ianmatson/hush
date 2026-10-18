<script lang="ts">
	import { isWholeIn, type WholeRange } from '$lib/shared/push-policy';
	import { Input } from '$lib/components/ui/input';

	let {
		before,
		after,
		value,
		range,
		onsave
	}: {
		before: string;
		after: string;
		value: number;
		range: WholeRange;
		onsave: (value: number) => void;
	} = $props();

	let outOfRange = $state(false);

	function change(input: HTMLInputElement) {
		const next = Number(input.value);
		outOfRange = !isWholeIn(next, range);
		if (outOfRange) input.value = String(value);
		else if (next !== value) onsave(next);
	}
</script>

<label class="flex items-center gap-2 text-sm"
	>{before}
	<Input
		type="number"
		class="h-8 w-16"
		min={range.min}
		max={range.max}
		{value}
		onchange={(e) => change(e.currentTarget)}
	/>
	{after}
	{#if outOfRange}<span class="text-xs text-destructive" role="alert"
			>Use a whole number from {range.min} to {range.max}.</span
		>{/if}</label
>
