<script lang="ts">
	import type { MarkColor } from '$lib/shared/types';
	import { parseMarkIcon } from '$lib/shared/mark-icons';
	import { LUCIDE_COMPONENTS } from '$lib/mark-icon-components';
	import { MARK_DOT, MARK_TEXT } from '$lib/marks';
	import { cn } from '$lib/utils';
	import Tag from '@lucide/svelte/icons/tag';

	let {
		kind,
		color,
		icon,
		class: className = 'size-3'
	}: {
		kind: 'category' | 'tag';
		color: MarkColor;
		icon?: string;
		class?: string;
	} = $props();

	const parsed = $derived(kind === 'category' ? parseMarkIcon(icon) : null);
	const Lucide = $derived(parsed?.kind === 'lucide' ? LUCIDE_COMPONENTS[parsed.id] : null);
</script>

{#if kind === 'tag'}
	<Tag class={cn('shrink-0', MARK_TEXT[color], className)} aria-hidden="true" />
{:else if Lucide}
	<Lucide class={cn('shrink-0', MARK_TEXT[color], className)} aria-hidden="true" />
{:else if parsed?.kind === 'emoji'}
	<span class="shrink-0 leading-none" aria-hidden="true">{parsed.text}</span>
{:else}
	<span
		class={cn('shrink-0 rounded-[3px]', MARK_DOT[color], className, 'scale-75')}
		aria-hidden="true"
	></span>
{/if}
