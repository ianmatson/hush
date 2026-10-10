<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { eventsFor, type SnoozeEvent } from '$lib/shared/snooze';
	import { snoozeOptions } from '$lib/time';
	import Zap from '@lucide/svelte/icons/zap';
	import { MediaQuery } from 'svelte/reactivity';

	/**
	 * Snooze choices for any menu: times, then "until something happens" (only the events that
	 * fit every selected thread).
	 */
	let {
		menu = 'dropdown',
		subjects,
		disabled = [],
		untilNewActivity = false,
		onpick
	}: {
		menu?: 'dropdown' | 'context';
		subjects: ('pr' | 'issue' | 'other')[];
		/** Conditions that are already true; shown greyed out. */
		disabled?: SnoozeEvent[];
		untilNewActivity?: boolean;
		onpick: (body: { until?: number; event?: SnoozeEvent }) => void;
	} = $props();

	const M = $derived(menu === 'context' ? ContextMenu : DropdownMenu);
	const events = $derived(eventsFor(subjects));
	// A submenu beside a phone-wide menu has no room: list the conditions under a heading instead.
	const narrow = new MediaQuery('max-width: 639px');
</script>

{#snippet eventItems()}
	{#each events as ev (ev.id)}
		<M.Item disabled={disabled.includes(ev.id)} onclick={() => onpick({ event: ev.id })}
			>{ev.label}{#if disabled.includes(ev.id)}<span class="ml-auto pl-3 text-xs">already</span
				>{/if}</M.Item
		>
	{/each}
{/snippet}

{#if untilNewActivity}
	<M.Item onclick={() => onpick({})}>Until new activity</M.Item>
	<M.Separator />
{/if}
{#each snoozeOptions() as opt (opt.label)}
	<M.Item onclick={() => onpick({ until: opt.until })}>{opt.label}</M.Item>
{/each}
{#if events.length}
	<M.Separator />
	{#if narrow.current}
		<M.Group>
			<M.GroupHeading class="flex items-center gap-2 text-xs text-muted-foreground"
				><Zap class="size-3.5" />Until something happens</M.GroupHeading
			>
			{@render eventItems()}
		</M.Group>
	{:else}
		<M.Sub>
			<M.SubTrigger><Zap />Until something happens</M.SubTrigger>
			<M.SubContent class="w-56">{@render eventItems()}</M.SubContent>
		</M.Sub>
	{/if}
{/if}
