<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery, webhooksQuery } from '$lib/queries';
	import { refreshWebhooksAfterInstall } from '$lib/webhook-install';
	import { takeSearchParams } from '$lib/search-params';
	import type { WebhookAccount } from '$lib/shared/types';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import ListSkeleton from './list-skeleton.svelte';

	const INSTALLED_PARAM = 'installed';
	const CARD_ID = 'github-access';

	const webhooks = createQuery(webhooksQuery);
	const me = createQuery(meQuery);
	const access = $derived(webhooks.data?.available ? webhooks.data : null);
	const lastWebhookAt = $derived(me.data?.lastWebhookAt ?? null);

	const STATE_LABELS: Record<WebhookAccount['state'], string> = {
		installed: 'Installed',
		suspended: 'Suspended by an owner',
		missing: 'Not installed'
	};
	const LIKELY_ACCOUNT_COUNT = 2;
	const SELECTION_LABELS = { all: 'all repositories', selected: 'selected repositories' };

	const detailOf = (account: WebhookAccount) =>
		account.selection
			? `${STATE_LABELS[account.state]}, ${SELECTION_LABELS[account.selection]}`
			: STATE_LABELS[account.state];

	onMount(() => {
		if (!takeSearchParams(INSTALLED_PARAM)[INSTALLED_PARAM]) return;
		refreshWebhooksAfterInstall()
			.then(() => {
				toast.success('The Hush GH app is installed. Items you track there now update in seconds.');
				document.getElementById(CARD_ID)?.scrollIntoView({ block: 'start' });
			})
			.catch((err: Error) => toast.error(err.message));
	});
</script>

{#if access || webhooks.isPending || webhooks.isError}
	<Card.Root id={CARD_ID} class="scroll-mt-20">
		<Card.Header>
			<Card.Title>Webhook updates</Card.Title>
			<Card.Description
				>Orgs that install the Hush GH app send Hush the changes to the pull requests and issues
				that you track as they happen. Everything else updates with polling.</Card.Description
			>
		</Card.Header>
		<Card.Content class="grid gap-3 text-sm">
			{#if access}
				<ul class="divide-y rounded-md border" aria-label="Accounts">
					{#each access.accounts as account (account.login)}
						<li class="flex items-center justify-between gap-3 px-3 py-2">
							<span class="min-w-0">
								<span class="block truncate"
									>{account.login}
									{#if account.kind === 'user'}<span class="text-muted-foreground">(you)</span
										>{/if}</span
								>
								<span class="text-xs text-muted-foreground">{detailOf(account)}</span>
							</span>
							<Button
								variant={account.state === 'missing' ? 'outline' : 'ghost'}
								size="sm"
								href={account.url}
								target="_blank"
								rel="noreferrer">{account.state === 'missing' ? 'Install…' : 'Manage'}</Button
							>
						</li>
					{/each}
				</ul>
			{:else if webhooks.isError}
				<p role="alert" class="text-xs text-destructive">
					Could not load the accounts: {webhooks.error.message}
				</p>
			{:else}
				<ListSkeleton rows={LIKELY_ACCOUNT_COUNT} label="Loading accounts" />
			{/if}
			<p class="text-xs leading-relaxed text-muted-foreground">
				{#if lastWebhookAt}Last webhook received {ago(lastWebhookAt)}.{/if}
				GitHub shows <b class="font-medium text-foreground">Request</b> to members who are not
				owners. An org can install the app and still hide its items from your sign-in: see
				<a
					class="underline underline-offset-2 hover:text-foreground"
					href="/docs/github-access#webhook-updates">Webhook updates</a
				>.
			</p>
		</Card.Content>
	</Card.Root>
{/if}
