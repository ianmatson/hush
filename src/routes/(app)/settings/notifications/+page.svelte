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
	import {
		CLEAR_NOTIFICATIONS_OPTIONS,
		DIGEST_MINUTES,
		LIMIT_COUNT,
		LIMIT_MINUTES,
		PUSH_REPEAT_OPTIONS,
		type ClearNotifications,
		type PushLimit,
		type PushRepeat
	} from '$lib/shared/push-policy';
	import * as Select from '$lib/components/ui/select';

	const DEFAULT_DIGEST_MINUTES = 30;
	const DEFAULT_PUSH_LIMIT: PushLimit = { count: 6, minutes: 30 };

	const labelOf = <T extends string>(options: { id: T; label: string }[], id: T) =>
		options.find((o) => o.id === id)?.label ?? id;

	function wholeIn(value: string, range: { min: number; max: number }): number | null {
		const n = Number(value);
		return Number.isInteger(n) && n >= range.min && n <= range.max ? n : null;
	}

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
					>A category can always push, or never push, for its items (<a
						class="underline"
						href="/settings/categories">Categories & tags</a
					>). More in settings.json (General).</Card.Description
				>
			</Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					id="push-action"
					label="“Needs you” items"
					description="Review requests, failed CI on your PRs, replies, direct mentions."
				>
					<Switch
						id="push-action"
						checked={settings.pushAction}
						onCheckedChange={(v) => saveSettings({ pushAction: v })}
					/>
				</SettingRow>
				<SettingRow
					id="push-fyi"
					label="FYI items"
					description="Usually noisy. Set a category to always push instead."
				>
					<Switch
						id="push-fyi"
						checked={settings.pushFyi}
						onCheckedChange={(v) => saveSettings({ pushFyi: v })}
					/>
				</SettingRow>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>How often</Card.Title>
				<Card.Description
					>Fewer buzzes on busy days. Each PR or issue has one notification, which later pushes
					replace.</Card.Description
				>
			</Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					label="Push the same item again"
					description="Opening Hush, or reading the item on GitHub, lets it push again."
				>
					<Select.Root
						type="single"
						value={settings.pushRepeat}
						onValueChange={(v) => saveSettings({ pushRepeat: v as PushRepeat })}
					>
						<Select.Trigger class="w-64" aria-label="Push the same item again"
							>{labelOf(PUSH_REPEAT_OPTIONS, settings.pushRepeat)}</Select.Trigger
						>
						<Select.Content>
							{#each PUSH_REPEAT_OPTIONS as o (o.id)}
								<Select.Item value={o.id} label={o.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</SettingRow>
				<SettingRow
					id="push-digest"
					label="Digest"
					description="Send pushes together, as one notification at a fixed interval."
				>
					<Switch
						id="push-digest"
						checked={settings.pushDigestMinutes !== null}
						onCheckedChange={(v) =>
							saveSettings({ pushDigestMinutes: v ? DEFAULT_DIGEST_MINUTES : null })}
					/>
				</SettingRow>
				{#if settings.pushDigestMinutes !== null}
					<label class="flex items-center gap-2 py-3 text-sm"
						>Every <Input
							type="number"
							class="h-8 w-20"
							min={DIGEST_MINUTES.min}
							max={DIGEST_MINUTES.max}
							value={settings.pushDigestMinutes}
							onchange={(e) => {
								const minutes = wholeIn(e.currentTarget.value, DIGEST_MINUTES);
								if (minutes !== null) saveSettings({ pushDigestMinutes: minutes });
							}}
						/> minutes</label
					>
				{/if}
				<SettingRow
					id="push-limit"
					label="Limit"
					description="After this many pushes, the rest wait and go as one digest."
				>
					<Switch
						id="push-limit"
						checked={settings.pushLimit !== null}
						onCheckedChange={(v) => saveSettings({ pushLimit: v ? DEFAULT_PUSH_LIMIT : null })}
					/>
				</SettingRow>
				{#if settings.pushLimit}
					{@const limit = settings.pushLimit}
					<div class="flex flex-wrap items-center gap-2 py-3 text-sm">
						<label class="flex items-center gap-2"
							>At most <Input
								type="number"
								class="h-8 w-20"
								min={LIMIT_COUNT.min}
								max={LIMIT_COUNT.max}
								value={limit.count}
								onchange={(e) => {
									const count = wholeIn(e.currentTarget.value, LIMIT_COUNT);
									if (count !== null) saveSettings({ pushLimit: { ...limit, count } });
								}}
							/> pushes</label
						>
						<label class="flex items-center gap-2"
							>in <Input
								type="number"
								class="h-8 w-20"
								min={LIMIT_MINUTES.min}
								max={LIMIT_MINUTES.max}
								value={limit.minutes}
								onchange={(e) => {
									const minutes = wholeIn(e.currentTarget.value, LIMIT_MINUTES);
									if (minutes !== null) saveSettings({ pushLimit: { ...limit, minutes } });
								}}
							/> minutes</label
						>
					</div>
				{/if}
				{#if settings.smartDecisions}
					<SettingRow
						id="push-urgent-now"
						label="Push blocking items at once"
						description="A “Needs you” item whose text says it blocks something or is an incident skips the digest and the limit. Quiet hours still hold it."
					>
						<Switch
							id="push-urgent-now"
							checked={settings.pushUrgentNow}
							onCheckedChange={(v) => saveSettings({ pushUrgentNow: v })}
						/>
					</SettingRow>
				{/if}
				<SettingRow
					id="push-while-open"
					label="Push while Hush is open"
					description="Off: while you use Hush on a device, new items show only in Hush."
				>
					<Switch
						id="push-while-open"
						checked={settings.pushWhileOpen}
						onCheckedChange={(v) => saveSettings({ pushWhileOpen: v })}
					/>
				</SettingRow>
				<SettingRow
					label="Clear notifications"
					description="Remove Hush notifications from a device when you use Hush there."
				>
					<Select.Root
						type="single"
						value={settings.clearNotifications}
						onValueChange={(v) => saveSettings({ clearNotifications: v as ClearNotifications })}
					>
						<Select.Trigger class="w-64" aria-label="Clear notifications"
							>{labelOf(CLEAR_NOTIFICATIONS_OPTIONS, settings.clearNotifications)}</Select.Trigger
						>
						<Select.Content>
							{#each CLEAR_NOTIFICATIONS_OPTIONS as o (o.id)}
								<Select.Item value={o.id} label={o.label} />
							{/each}
						</Select.Content>
					</Select.Root>
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
