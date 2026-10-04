<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { eventsFor, type SnoozeEvent } from '$lib/shared/snooze';
	import { snoozeOptions } from '$lib/time';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import Zap from '@lucide/svelte/icons/zap';

	/** Snooze choices as a dialog: for phones, where nested menus do not fit on the screen. */
	let {
		open = $bindable(false),
		subjects,
		disabled = [],
		onpick
	}: {
		open?: boolean;
		subjects: ('pr' | 'issue' | 'other')[];
		disabled?: SnoozeEvent[];
		onpick: (body: { until?: number; event?: SnoozeEvent }) => void;
	} = $props();

	const events = $derived(eventsFor(subjects));
	const pick = (body: { until?: number; event?: SnoozeEvent }) => {
		open = false;
		onpick(body);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="gap-3 sm:max-w-sm">
		<Dialog.Header><Dialog.Title>Snooze</Dialog.Title></Dialog.Header>
		<section class="grid gap-0.5">
			<h3 class="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
				<AlarmClock class="size-3.5" />Until a time
			</h3>
			{#each snoozeOptions() as opt (opt.label)}
				<Button
					variant="ghost"
					class="h-10 justify-start"
					onclick={() => pick({ until: opt.until })}>{opt.label}</Button
				>
			{/each}
		</section>
		{#if events.length}
			<section class="grid gap-0.5 border-t pt-3">
				<h3 class="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
					<Zap class="size-3.5" />Until something happens
				</h3>
				{#each events as ev (ev.id)}
					<Button
						variant="ghost"
						class="h-10 justify-start"
						disabled={disabled.includes(ev.id)}
						onclick={() => pick({ event: ev.id })}
						>{ev.label}{#if disabled.includes(ev.id)}<span
								class="ml-auto text-xs text-muted-foreground">already</span
							>{/if}</Button
					>
				{/each}
			</section>
		{/if}
	</Dialog.Content>
</Dialog.Root>
