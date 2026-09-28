<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { keys, meQuery, pushDevicesQuery, queryClient } from '$lib/queries';
	import {
		currentSubscription,
		disablePush,
		enablePush,
		pushSupport,
		type PushSupport
	} from '$lib/push';
	import { saveSettings } from '$lib/save-settings';
	import { fromClock, inQuietHours, toClock } from '$lib/shared/quiet';
	import type { QuietHours } from '$lib/shared/types';

	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import Trash from '@lucide/svelte/icons/trash';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	const me = createQuery(meQuery);
	const devices = createQuery(pushDevicesQuery);
	const settings = $derived(me.data?.settings);

	const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const quiet = $derived(settings?.quietHours ?? null);
	// Checked again each minute, for the "Quiet now" note.
	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(t);
	});
	const quietNow = $derived(inQuietHours(quiet, now));

	function setQuiet(patch: Partial<QuietHours> | null) {
		const next: QuietHours | null =
			patch === null
				? null
				: {
						...(quiet ?? { from: 22 * 60, to: 7 * 60, weekends: false, timeZone: browserZone }),
						...patch
					};
		saveSettings({ quietHours: next }, next ? 'Quiet hours saved' : 'Quiet hours off');
	}

	function setClock(key: 'from' | 'to', value: string) {
		const m = fromClock(value);
		if (m !== null && m !== quiet?.[key]) setQuiet({ [key]: m });
	}

	let support = $state<PushSupport>('unsupported');
	let thisDevice = $state<PushSubscription | null>(null);
	let busy = $state(false);

	async function refreshDevice() {
		support = pushSupport();
		thisDevice = await currentSubscription().catch(() => null);
		await queryClient.invalidateQueries({ queryKey: keys.pushDevices });
	}

	async function togglePush() {
		busy = true;
		try {
			const turningOn = !thisDevice;
			if (turningOn) await enablePush();
			else await disablePush();
			await refreshDevice();
			toast.success(turningOn ? 'Push is on for this device.' : 'Push is off for this device.');
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			busy = false;
		}
	}

	async function testPush() {
		try {
			const { sent } = await api.testPush();
			toast.success(`Sent a test notification to ${sent} device${sent === 1 ? '' : 's'}.`);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function removeDevice(endpoint: string) {
		await api.unsubscribe(endpoint);
		if (thisDevice?.endpoint === endpoint) await thisDevice.unsubscribe();
		await refreshDevice();
	}

	onMount(() => {
		support = pushSupport();
		currentSubscription()
			.then((s) => (thisDevice = s))
			.catch(() => {});
	});
</script>

<svelte:head><title>Notifications · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Notifications</h1>
		<p class="text-sm text-muted-foreground">
			Native push notifications, also when Hush is closed.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Devices</Card.Title>
			<Card.Description
				>Each browser or installed app that gets push notifications.</Card.Description
			>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if support === 'needs-install'}
				<Alert.Root>
					<Alert.Description>
						On iPhone and iPad, add Hush to your Home Screen first (Share → Add to Home Screen).
						Then open it from there and turn on push.
					</Alert.Description>
				</Alert.Root>
			{:else if support === 'unsupported'}
				<Alert.Root
					><Alert.Description>This browser does not support Web Push.</Alert.Description
					></Alert.Root
				>
			{:else}
				<div class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">This device</p>
						<p class="text-xs text-muted-foreground">
							{thisDevice ? 'Receives push notifications.' : 'Push is off.'}
						</p>
					</div>
					<div class="flex gap-2">
						{#if devices.data?.length}<Button variant="outline" size="sm" onclick={testPush}
								>Send test</Button
							>{/if}
						<Button
							size="sm"
							variant={thisDevice ? 'outline' : 'default'}
							onclick={togglePush}
							disabled={busy}
						>
							{#if busy}<LoaderCircle class="animate-spin" />{/if}
							{thisDevice ? 'Turn off' : 'Turn on'}
						</Button>
					</div>
				</div>
			{/if}

			{#if devices.data?.length}
				<ul class="grid gap-1 rounded-lg border p-1 text-sm">
					{#each devices.data as d (d.id)}
						<li
							class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
						>
							<span>
								{d.label ?? 'Browser'}
								{#if thisDevice?.endpoint === d.endpoint}<span
										class="ml-1 text-xs text-muted-foreground">(this device)</span
									>{/if}
							</span>
							<span class="flex items-center gap-2 text-xs text-muted-foreground">
								added {ago(d.createdAt)}
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label="Remove device"
									onclick={() => removeDevice(d.endpoint)}><Trash /></Button
								>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if settings}
		<Card.Root>
			<Card.Header>
				<Card.Title>What to push</Card.Title>
				<Card.Description
					>Only what comes into Your turn: Waiting and Updates never push. A rule can push more or
					less for some repos, people, or kinds of activity (Advanced).</Card.Description
				>
			</Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					id="push"
					label="When something becomes your turn"
					description="A review request, a reply to you, CI that fails on your PR, a PR ready to merge."
				>
					<Switch
						id="push"
						checked={settings.push}
						onCheckedChange={(v) => saveSettings({ push: v })}
					/>
				</SettingRow>
				<SettingRow
					id="push-resolved"
					label="Update an alert when it is resolved"
					description="An alert from the last day changes to a quiet “✓ You approved” (or “CI passes now”) and closes itself."
				>
					<Switch
						id="push-resolved"
						checked={settings.pushResolved}
						onCheckedChange={(v) => saveSettings({ pushResolved: v })}
					/>
				</SettingRow>
			</Card.Content>
		</Card.Root>
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
					<Switch
						id="quiet-on"
						checked={!!quiet}
						onCheckedChange={(v) => setQuiet(v ? {} : null)}
					/>
				</SettingRow>
				{#if quiet}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
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
					<SettingRow
						id="quiet-weekends"
						label="All weekend"
						description="Also quiet all day on Saturday and Sunday."
					>
						<Switch
							id="quiet-weekends"
							checked={quiet.weekends}
							onCheckedChange={(v) => setQuiet({ weekends: v })}
						/>
					</SettingRow>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
