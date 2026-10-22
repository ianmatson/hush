<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { on } from 'svelte/events';
	import { itemHover } from '$lib/item-hover.svelte';
	import ItemCard from './item-card.svelte';

	const CARD_GAP_PX = 4;
	const VIEWPORT_MARGIN_PX = 8;

	const shown = $derived(itemHover.shown);
	let lastShown = $state.raw(itemHover.shown);
	$effect.pre(() => {
		if (shown) lastShown = shown;
	});

	$effect(() => {
		const close = () => itemHover.close();
		const stopListening = [
			on(window, 'keydown', close),
			on(window, 'blur', close),
			on(window, 'pointerdown', close, { capture: true }),
			on(window, 'scroll', close, { capture: true, passive: true })
		];
		return () => {
			for (const stop of stopListening) stop();
			close();
		};
	});
</script>

<PopoverPrimitive.Root
	open={!!shown}
	onOpenChange={(open) => {
		if (!open) itemHover.close();
	}}
>
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			customAnchor={lastShown?.anchor}
			side="bottom"
			align="start"
			sideOffset={CARD_GAP_PX}
			collisionPadding={VIEWPORT_MARGIN_PX}
			trapFocus={false}
			onOpenAutoFocus={(e) => e.preventDefault()}
			onCloseAutoFocus={(e) => e.preventDefault()}
			aria-hidden="true"
			data-slot="item-hover-card"
			class="z-50 w-96 max-w-[calc(100vw-1rem)] origin-(--bits-popover-content-transform-origin) rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
		>
			{#snippet child({ props, wrapperProps })}
				<div {...wrapperProps} style:pointer-events="none">
					<div {...props} style:pointer-events="none">
						{#if lastShown}
							<ItemCard item={lastShown.entry.item} marks={lastShown.entry.marks} />
						{/if}
					</div>
				</div>
			{/snippet}
		</PopoverPrimitive.Content>
	</PopoverPrimitive.Portal>
</PopoverPrimitive.Root>
