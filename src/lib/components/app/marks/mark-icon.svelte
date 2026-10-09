<script lang="ts">
	import type { MarkColor } from '$lib/shared/types';
	import { parseMarkIcon } from '$lib/shared/mark-icons';
	import { MARK_DOT, MARK_TEXT } from '$lib/marks';
	import { cn } from '$lib/utils';
	import LucideIcon from './lucide-icon.svelte';

	let {
		color,
		icon,
		class: className = 'size-3'
	}: {
		color: MarkColor;
		icon?: string;
		class?: string;
	} = $props();

	const parsed = $derived(parseMarkIcon(icon));
</script>

{#snippet dot()}
	<span
		class={cn('shrink-0 rounded-[3px]', MARK_DOT[color], className, 'scale-75')}
		aria-hidden="true"
	></span>
{/snippet}

{#if parsed?.kind === 'lucide'}
	<LucideIcon id={parsed.id} class={cn('shrink-0', MARK_TEXT[color], className)} fallback={dot} />
{:else if parsed?.kind === 'emoji'}
	<span class="shrink-0 leading-none" aria-hidden="true">{parsed.text}</span>
{:else}
	{@render dot()}
{/if}
