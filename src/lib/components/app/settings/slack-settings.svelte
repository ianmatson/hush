<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { keys, meQuery, queryClient, slackQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import type { AlertChannels } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	const CONNECTED_PARAM = 'slack';
	const ERROR_PARAM = 'slack_error';

	const slack = createQuery(slackQuery);
	const connection = $derived(slack.data?.connection ?? null);
	const me = createQuery(meQuery);
	const channels = $derived(me.data?.settings.alertChannels);

	function saveChannel(channel: keyof AlertChannels, on: boolean) {
		if (!channels) return Promise.resolve(false);
		return saveSettings({ alertChannels: { ...channels, [channel]: on } });
	}
	let busy = $state<'test' | 'disconnect' | null>(null);

	async function run(action: 'test' | 'disconnect', request: () => Promise<unknown>, done: string) {
		busy = action;
		try {
			await request();
			toast.success(done);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			busy = null;
			await queryClient.invalidateQueries({ queryKey: keys.slack });
		}
	}

	const sendTest = () => run('test', api.testSlack, 'Sent a test message to Slack.');
	const disconnect = () => run('disconnect', api.disconnectSlack, 'Slack is disconnected.');

	onMount(() => {
		const url = new URL(location.href);
		const connected = url.searchParams.get(CONNECTED_PARAM) === 'connected';
		const error = url.searchParams.get(ERROR_PARAM);
		if (!connected && !error) return;
		queryClient.invalidateQueries({ queryKey: keys.slack });
		if (connected) toast.success('Slack is connected.');
		if (error) toast.error(error);
		url.searchParams.delete(CONNECTED_PARAM);
		url.searchParams.delete(ERROR_PARAM);
		goto(url.pathname + url.search + url.hash, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#if slack.data?.available}
	<Card.Root id="slack">
		<Card.Header>
			<Card.Title>Slack</Card.Title>
			<Card.Description
				>Get alerts as direct messages from the Hush app in Slack. Your workspace admin may need to
				approve the app.</Card.Description
			>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-medium">
						{connection ? connection.teamName : 'Not connected'}
					</p>
					<p class="text-xs text-muted-foreground">
						{connection
							? `Connected ${ago(connection.connectedAt)}.`
							: 'Connect to send alerts to Slack.'}
					</p>
				</div>
				<div class="flex gap-2">
					{#if connection}
						<Button variant="outline" size="sm" onclick={sendTest} disabled={busy !== null}>
							{#if busy === 'test'}<LoaderCircle class="animate-spin" />{/if}
							Send test
						</Button>
						<Button variant="outline" size="sm" onclick={disconnect} disabled={busy !== null}>
							{#if busy === 'disconnect'}<LoaderCircle class="animate-spin" />{/if}
							Disconnect
						</Button>
					{:else}
						<Button size="sm" href="/api/slack/connect" data-sveltekit-reload>Connect Slack</Button>
					{/if}
				</div>
			</div>
			{#if connection && channels}
				<div class="divide-y border-t pt-4">
					<SettingRow
						id="alerts-slack"
						label="Alerts in Slack"
						description="Send each alert as a direct message."
					>
						<SavedSwitch
							id="alerts-slack"
							checked={channels.slack}
							onsave={(v) => saveChannel('slack', v)}
						/>
					</SettingRow>
					<SettingRow
						id="alerts-push"
						label="Push to devices too"
						description="Off: alerts go only to Slack."
					>
						<SavedSwitch
							id="alerts-push"
							checked={channels.push}
							onsave={(v) => saveChannel('push', v)}
						/>
					</SettingRow>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
