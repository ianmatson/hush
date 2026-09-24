<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { leaveTo, meQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';

	const me = createQuery(meQuery);

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}

	async function deleteAccount() {
		if (
			!confirm('Delete your Hush account? This removes your token, rules, feeds, and push devices.')
		)
			return;
		await api.deleteAccount();
		leaveTo('/login');
	}
</script>

<svelte:head><title>Account · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Account</h1>
	</div>

	{#if me.data}
		<Card.Root>
			<Card.Content class="grid gap-3 text-sm">
				<div class="grid grid-cols-[8rem_1fr] gap-y-1.5">
					<span class="text-muted-foreground">GitHub</span><span>@{me.data.login}</span>
					<span class="text-muted-foreground">Token scopes</span><span class="font-mono text-xs"
						>{me.data.scopes.join(', ') || 'unknown'}</span
					>
					<span class="text-muted-foreground">Last sync</span><span
						>{me.data.lastPollAt ? ago(me.data.lastPollAt) : 'not yet'}</span
					>
				</div>
				{#if me.data.lastPollError}
					<Alert.Root variant="destructive"
						><Alert.Description>{me.data.lastPollError}</Alert.Description></Alert.Root
					>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onclick={signOut}>Change token</Button>
					<Button variant="outline" size="sm" onclick={signOut}>Sign out</Button>
					<Button variant="destructive" size="sm" onclick={deleteAccount}>Delete account</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Signing out also clears Hush data cached in this browser.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
