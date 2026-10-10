<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import SnoozeItems from './snooze-items.svelte';
	import type { SnoozeChoice } from '$lib/shared/item-snooze';
	import type { SnoozeEvent } from '$lib/shared/snooze';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import AlarmClockOff from '@lucide/svelte/icons/alarm-clock-off';

	let {
		snoozed,
		subjects,
		disabled = [],
		labelClass,
		onpick,
		onwake
	}: {
		snoozed: boolean;
		subjects: ('pr' | 'issue' | 'other')[];
		disabled?: SnoozeEvent[];
		labelClass: string;
		onpick: (choice: SnoozeChoice) => void;
		onwake: () => void;
	} = $props();
</script>

{#if snoozed}
	<Button variant="ghost" size="sm" aria-label="Wake up" onclick={onwake}>
		<AlarmClockOff /><span class={labelClass}>Wake up</span>
	</Button>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" aria-label="Snooze">
					<AlarmClock /><span class={labelClass}>Snooze</span>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-56">
			<SnoozeItems {subjects} {disabled} untilNewActivity {onpick} />
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
