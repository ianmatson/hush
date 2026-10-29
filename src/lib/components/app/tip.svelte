<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createAttachmentKey } from 'svelte/attachments';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		text,
		focusable = true,
		onlyWhenTruncated = false,
		children
	}: {
		text: string | null | undefined;
		focusable?: boolean;
		onlyWhenTruncated?: boolean;
		children: Snippet<[Record<string, unknown>]>;
	} = $props();

	const truncationKey = createAttachmentKey();
	let trigger: HTMLElement | undefined;
	let open = $state(false);

	const isEllipsized = (el: Element) =>
		getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth;

	const isTruncated = (el: HTMLElement) => [el, ...el.querySelectorAll('*')].some(isEllipsized);

	const mayOpen = () => !onlyWhenTruncated || (!!trigger && isTruncated(trigger));

	function trackTrigger(el: HTMLElement) {
		trigger = el;
		const closeOnceItFits = () => {
			if (open && !isTruncated(el)) open = false;
		};
		const resizes = new ResizeObserver(closeOnceItFits);
		const observeParts = () => {
			for (const part of [el, ...el.querySelectorAll('*')]) resizes.observe(part);
		};
		const mutations = new MutationObserver(() => {
			observeParts();
			closeOnceItFits();
		});
		observeParts();
		mutations.observe(el, { subtree: true, childList: true, characterData: true });
		return () => {
			resizes.disconnect();
			mutations.disconnect();
			if (trigger === el) trigger = undefined;
		};
	}

	function triggerProps(props: Record<string, unknown>) {
		const withFocus = focusable ? props : { ...props, tabindex: undefined };
		return onlyWhenTruncated ? { ...withFocus, [truncationKey]: trackTrigger } : withFocus;
	}
</script>

{#if text}
	<Tooltip.Root bind:open={() => open, (next) => (open = next && mayOpen())}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(triggerProps(props))}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content collisionPadding={8}>{text}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render children({})}
{/if}
