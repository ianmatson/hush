<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, meQuery, queryClient } from '$lib/queries';
	import { live } from '$lib/live-state.svelte';
	import { reportResolved } from '$lib/recheck';
	import { ago } from '$lib/time';
	import { cn } from '$lib/utils';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	/** The top of a lane: its name, what it holds, the sync status, and problems with GitHub. */
	let { title, intro, actions }: { title: string; intro: string; actions?: Snippet } = $props();

	const me = createQuery(meQuery);
	let syncing = $state(false);
	async function sync() {
		syncing = true;
		try {
			const status = await api.sync();
			if (status.lastError) toast.error(status.lastError);
			reportResolved(status.resolved ?? []);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: keys.itemsAll }),
				queryClient.invalidateQueries({ queryKey: keys.me })
			]);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			syncing = false;
		}
	}
</script>

{#if me.data?.lastPollError}
	<Alert.Root variant="destructive" class="mb-4">
		<Alert.Title>Hush cannot read your notifications</Alert.Title>
		<Alert.Description>
			{me.data.lastPollError}
			{#if /token|sign in/i.test(me.data.lastPollError)}<a class="underline" href="/login"
					>Sign in again</a
				>{/if}
		</Alert.Description>
	</Alert.Root>
{/if}
{#if me.data?.ssoHiddenOrgs}
	<Alert.Root class="mb-4">
		<Alert.Title
			>GitHub hides notifications from {me.data.ssoHiddenOrgs}
			{me.data.ssoHiddenOrgs === 1 ? 'org' : 'orgs'}</Alert.Title
		>
		<Alert.Description>
			These orgs use SAML single sign-on, and your token is not authorized for them. Sign in again
			and authorize Hush for them, or see <a class="underline" href="/settings/account#token"
				>GitHub access</a
			>.
		</Alert.Description>
	</Alert.Root>
{/if}

<div class="mb-4 flex items-start gap-3">
	<div class="min-w-0 flex-1">
		<h1 class="text-lg font-semibold tracking-tight">{title}</h1>
		<p class="text-sm text-muted-foreground">{intro}</p>
	</div>
	<div class="flex shrink-0 items-center gap-1 pt-0.5">
		{@render actions?.()}
		<span class="hidden text-xs text-muted-foreground sm:inline">
			{#if syncing || live.syncing}Syncing…{:else if me.data?.lastPollAt}Synced {ago(
					me.data.lastPollAt
				)}{:else}First sync…{/if}
		</span>
		<Button variant="ghost" size="icon-sm" aria-label="Sync now" onclick={sync} disabled={syncing}>
			<RefreshCw class={cn((syncing || live.syncing) && 'animate-spin')} />
		</Button>
	</div>
</div>
