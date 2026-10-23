<script lang="ts" generics="T = never">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { on } from 'svelte/events';

	let { open = $bindable(false), ...restProps }: TooltipPrimitive.RootProps<T> = $props();

	$effect(() => {
		if (!open) return;
		return on(window, 'scroll', () => (open = false), { capture: true, passive: true });
	});
</script>

<TooltipPrimitive.Root bind:open {...restProps} />
