<script lang="ts">
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Tip from './tip.svelte';

	const SHOW_WHEN_BELOW_PX = 400;
	const APPEAR_MS = 150;

	let {
		scroller,
		content,
		class: className
	}: {
		scroller: HTMLElement | Window | null;
		content: HTMLElement | null;
		class?: string;
	} = $props();

	let farFromBottom = $state(false);

	function scrollBoxOf(target: HTMLElement | Window): Element {
		return target instanceof Window
			? (document.scrollingElement ?? document.documentElement)
			: target;
	}

	$effect(() => {
		const target = scroller;
		const observed = content;
		if (!target || !observed) return;
		const box = scrollBoxOf(target);
		const measure = () => {
			const belowView = box.scrollHeight - box.scrollTop - box.clientHeight;
			farFromBottom = belowView > SHOW_WHEN_BELOW_PX;
		};
		measure();
		const resizes = new ResizeObserver(measure);
		resizes.observe(observed);
		if (target instanceof HTMLElement) resizes.observe(target);
		else window.addEventListener('resize', measure);
		target.addEventListener('scroll', measure, { passive: true });
		return () => {
			resizes.disconnect();
			window.removeEventListener('resize', measure);
			target.removeEventListener('scroll', measure);
			farFromBottom = false;
		};
	});

	function scrollToBottom() {
		if (!scroller) return;
		scroller.scrollTo({
			top: scrollBoxOf(scroller).scrollHeight,
			behavior: prefersReducedMotion.current ? 'instant' : 'smooth'
		});
	}
</script>

{#if farFromBottom}
	<div
		class={cn('z-20', className)}
		transition:scale={{
			start: 0.8,
			duration: prefersReducedMotion.current ? 0 : APPEAR_MS,
			easing: cubicOut
		}}
	>
		<Tip text="Scroll to bottom">
			{#snippet children(props)}
				<Button
					{...props}
					variant="outline"
					size="icon"
					class="rounded-full bg-popover/95 shadow-md backdrop-blur"
					aria-label="Scroll to bottom"
					onclick={(e: MouseEvent) => {
						(props.onclick as ((e: MouseEvent) => void) | undefined)?.(e);
						scrollToBottom();
					}}><ArrowDown /></Button
				>
			{/snippet}
		</Tip>
	</div>
{/if}
