<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { eventsFor, type SnoozeEvent } from '$lib/shared/snooze';
	import { snoozeOptions } from '$lib/time';
	import Zap from '@lucide/svelte/icons/zap';

	/**
	 * Snooze choices for any menu: times, then "until something happens" (only the events that
	 * fit every selected thread).
	 */
	let {
		menu = 'dropdown',
		subjects,
		disabled = [],
		onpick
	}: {
		menu?: 'dropdown' | 'context';
		subjects: ('pr' | 'issue' | 'other')[];
		/** Conditions that are already true; shown greyed out. */
		disabled?: SnoozeEvent[];
		onpick: (body: { until?: number; event?: SnoozeEvent }) => void;
	} = $props();

	const M = $derived(menu === 'context' ? ContextMenu : DropdownMenu);
	const events = $derived(eventsFor(subjects));
</script>

{#each snoozeOptions() as opt (opt.label)}
	<M.Item onclick={() => onpick({ until: opt.until })}>{opt.label}</M.Item>
{/each}
{#if events.length}
	<M.Separator />
	<M.Sub>
		<M.SubTrigger><Zap />Until something happens</M.SubTrigger>
		<M.SubContent class="w-56">
			{#each events as ev (ev.id)}
				<M.Item disabled={disabled.includes(ev.id)} onclick={() => onpick({ event: ev.id })}
					>{ev.label}{#if disabled.includes(ev.id)}<span class="ml-auto pl-3 text-xs">already</span
						>{/if}</M.Item
				>
			{/each}
		</M.SubContent>
	</M.Sub>
{/if}
