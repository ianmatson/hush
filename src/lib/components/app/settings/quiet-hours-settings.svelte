<script lang="ts">
	import { onMount } from 'svelte';
	import { saveSettings } from '$lib/save-settings';
	import { fromClock, inQuietHours, toClock } from '$lib/shared/quiet';
	import type { QuietHours } from '$lib/shared/types';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';

	let { quiet }: { quiet: QuietHours | null } = $props();

	const QUIET_NOW_CHECK_MS = 60_000;
	const DEFAULT_QUIET_HOURS = { from: 22 * 60, to: 7 * 60, weekends: false };
	const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), QUIET_NOW_CHECK_MS);
		return () => clearInterval(t);
	});
	const quietNow = $derived(inQuietHours(quiet, now));

	function setQuiet(patch: Partial<QuietHours> | null): Promise<boolean> {
		const next: QuietHours | null =
			patch === null
				? null
				: { ...(quiet ?? { ...DEFAULT_QUIET_HOURS, timeZone: browserZone }), ...patch };
		return saveSettings({ quietHours: next });
	}

	function setClock(key: 'from' | 'to', value: string) {
		const m = fromClock(value);
		if (m !== null && m !== quiet?.[key]) setQuiet({ [key]: m });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Quiet hours</Card.Title>
		<Card.Description
			>No pushes at these times. The alerts go in the bell history, and one push lists them when
			quiet hours end.</Card.Description
		>
	</Card.Header>
	<Card.Content class="divide-y">
		<SettingRow
			id="quiet-on"
			label="Quiet hours"
			description={quiet ? (quietNow ? 'Quiet now.' : 'Not quiet now.') : 'Off.'}
		>
			<SavedSwitch id="quiet-on" checked={!!quiet} onsave={(v) => setQuiet(v ? {} : null)} />
			{#snippet extra()}
				{#if quiet}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
						<label class="flex items-center gap-2"
							>From <Input
								type="time"
								class="h-8 w-auto"
								value={toClock(quiet.from)}
								onchange={(e) => setClock('from', e.currentTarget.value)}
							/></label
						>
						<label class="flex items-center gap-2"
							>to <Input
								type="time"
								class="h-8 w-auto"
								value={toClock(quiet.to)}
								onchange={(e) => setClock('to', e.currentTarget.value)}
							/></label
						>
						<span class="text-xs text-muted-foreground">
							{quiet.from > quiet.to ? 'Ends the next morning.' : ''}
							Time zone: {quiet.timeZone}.
							{#if quiet.timeZone !== browserZone}
								<button
									type="button"
									class="underline underline-offset-2 hover:text-foreground"
									onclick={() => setQuiet({ timeZone: browserZone })}>Use {browserZone}</button
								>
							{/if}
						</span>
					</div>
				{/if}
			{/snippet}
		</SettingRow>
		{#if quiet}
			<SettingRow
				id="quiet-weekends"
				label="All weekend"
				description="Also quiet all day on Saturday and Sunday."
			>
				<SavedSwitch
					id="quiet-weekends"
					checked={quiet.weekends}
					onsave={(v) => setQuiet({ weekends: v })}
				/>
			</SettingRow>
		{/if}
	</Card.Content>
</Card.Root>
