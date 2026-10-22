<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { keys, meQuery, pushDevicesQuery, queryClient, slackQuery } from '$lib/queries';
	import { currentSubscription, disablePush, enablePush, pushSupport } from '$lib/push';
	import { saveSettings } from '$lib/save-settings';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TextSkeleton from './text-skeleton.svelte';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import Trash from '@lucide/svelte/icons/trash';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	const me = createQuery(meQuery);
	const devices = createQuery(pushDevicesQuery);
	const slack = createQuery(slackQuery);
	const pushToDevicesOff = $derived(me.data?.settings.alertChannels.push === false);
	const slackConnected = $derived(!!slack.data?.connection);

	const support = pushSupport();
	let thisDevice = $state<PushSubscription | null>(null);
	let busy = $state(false);

	async function readThisDevice() {
		thisDevice = await currentSubscription().catch(() => null);
	}

	async function refreshDevice() {
		await readThisDevice();
		await queryClient.invalidateQueries({ queryKey: keys.pushDevices });
	}

	onMount(() => void readThisDevice());

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
		try {
			await api.unsubscribe(endpoint);
			if (thisDevice?.endpoint === endpoint) await thisDevice.unsubscribe();
		} catch (err) {
			toast.error((err as Error).message);
		}
		await refreshDevice();
	}

	const thisDeviceStatus = $derived(
		!thisDevice
			? 'Push is off.'
			: pushToDevicesOff
				? 'Set up, but push to devices is off.'
				: 'Receives push notifications.'
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Devices</Card.Title>
		<Card.Description>Each browser or installed app that gets push notifications.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		{#if pushToDevicesOff && !slackConnected}
			<SettingRow
				id="alerts-push-devices"
				label="Push to devices"
				description="Off: alerts do not push to any device."
			>
				<SavedSwitch
					id="alerts-push-devices"
					checked={false}
					onsave={(on) => saveSettings({ alertChannels: { push: on } })}
				/>
			</SettingRow>
		{/if}

		{#if support === 'needs-install'}
			<Alert.Root>
				<Alert.Description>
					On iPhone and iPad, add Hush to your Home Screen first (Share → Add to Home Screen). Then
					open it from there and turn on push.
				</Alert.Description>
			</Alert.Root>
		{:else if support === 'unsupported'}
			<Alert.Root
				><Alert.Description>This browser does not support Web Push.</Alert.Description></Alert.Root
			>
		{:else}
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-medium">This device</p>
					<p class="text-xs text-muted-foreground">{thisDeviceStatus}</p>
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
		{:else if devices.isPending && thisDevice}
			<ul
				role="status"
				aria-label="Loading devices"
				class="grid gap-1 rounded-lg border p-1 text-sm"
			>
				<li class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
					<TextSkeleton class="w-36" />
					<span class="flex items-center gap-2">
						<TextSkeleton line="xs" class="w-16" />
						<Skeleton class="size-6" />
					</span>
				</li>
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
