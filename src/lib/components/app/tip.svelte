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
	let truncated = $state(false);

	const isEllipsized = (el: Element) =>
		getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth;

	function trackTruncation(el: HTMLElement) {
		const parts = [el, ...el.querySelectorAll('*')];
		const observer = new ResizeObserver(() => (truncated = parts.some(isEllipsized)));
		for (const part of parts) observer.observe(part);
		return () => observer.disconnect();
	}

	function triggerProps(props: Record<string, unknown>) {
		const withFocus = focusable ? props : { ...props, tabindex: undefined };
		return onlyWhenTruncated ? { ...withFocus, [truncationKey]: trackTruncation } : withFocus;
	}
</script>

{#if text}
	<Tooltip.Root disabled={onlyWhenTruncated && !truncated}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(triggerProps(props))}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{text}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render children({})}
{/if}
