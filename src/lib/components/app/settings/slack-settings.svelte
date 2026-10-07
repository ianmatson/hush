<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { keys, queryClient, slackQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	const CONNECTED_PARAM = 'slack';
	const ERROR_PARAM = 'slack_error';

	const slack = createQuery(slackQuery);
	const connection = $derived(slack.data?.connection ?? null);
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
		<Card.Content>
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
		</Card.Content>
	</Card.Root>
{/if}
