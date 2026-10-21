<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { mcpApi } from '$lib/mcp-api';
	import type { McpGrantsDTO } from '$lib/shared/mcp';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Plug from '@lucide/svelte/icons/plug';

	let data = $state<McpGrantsDTO | null>(null);
	let loading = $state(true);
	let error = $state('');
	let confirming = $state<string | null>(null);
	let revoking = $state<string | null>(null);
	let revokeError = $state('');
	let notice = $state('');
	let confirmButton = $state<HTMLButtonElement | null>(null);
	const date = (value: number) => new Date(value).toLocaleString();

	async function load() {
		loading = true;
		error = '';
		try {
			data = await mcpApi.grants();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	async function confirmRevoke(id: string) {
		confirming = id;
		revokeError = '';
		await tick();
		confirmButton?.focus();
	}

	async function revoke(id: string, name: string) {
		if (!data || revoking) return;
		revoking = id;
		revokeError = '';
		try {
			await mcpApi.revoke(id, data.csrfToken);
			data = { ...data, grants: data.grants.filter((grant) => grant.id !== id) };
			confirming = null;
			notice = `Access revoked for ${name}.`;
		} catch (err) {
			revokeError = (err as Error).message;
		} finally {
			revoking = null;
		}
	}

	onMount(load);
</script>

<svelte:head><title>Authorized apps · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Authorized apps</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Manage the apps that can read your saved views through MCP.
		</p>
	</div>
	<Card.Root>
		<Card.Content class="flex gap-3 text-sm">
			<ShieldCheck class="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<div class="grid gap-1">
				<p class="font-medium">Read-only access, limited to the views you choose</p>
				<p class="text-muted-foreground">
					Apps read cached pull request and issue data. They cannot change GitHub or your Hush
					settings. To change an app’s views, revoke its access and connect it again.
				</p>
			</div>
		</Card.Content>
	</Card.Root>
	<p role="status" class="text-sm text-muted-foreground empty:hidden">{notice}</p>
	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Title>Could not load authorized apps</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
			<div class="mt-2">
				<Button variant="outline" class="min-h-11" onclick={load}>Retry</Button>
			</div>
		</Alert.Root>
	{:else if loading}
		<p role="status" class="text-sm text-muted-foreground">Loading authorized apps…</p>
	{:else if data}
		<Card.Root>
			<Card.Header>
				<Card.Title>MCP server</Card.Title>
				<Card.Description
					>Use this address in an app that supports MCP authorization.</Card.Description
				>
			</Card.Header>
			<Card.Content
				><code class="block text-xs break-all select-all">{data.resource}</code></Card.Content
			>
		</Card.Root>
		{#if !data.grants.length}
			<Card.Root>
				<Card.Content class="grid justify-items-center gap-2 py-6 text-center">
					<Plug class="size-6 text-muted-foreground" aria-hidden="true" />
					<h2 class="font-medium">No authorized apps</h2>
					<p class="max-w-sm text-sm text-muted-foreground">
						Connect an app to the MCP server to choose which saved views it can read.
					</p>
				</Card.Content>
			</Card.Root>
		{:else}
			<ul class="grid gap-4" aria-label="Authorized apps">
				{#each data.grants as grant (grant.id)}
					<li>
						<Card.Root>
							<Card.Header>
								<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
									<h2 class="min-w-0 font-semibold break-words">{grant.clientName}</h2>
									{#if grant.status === 'active'}
										<Badge variant="outline">Active</Badge>
									{:else}
										<Badge variant="destructive">Expired</Badge>
									{/if}
								</div>
								<Card.Description>Read saved views · {grant.scope}</Card.Description>
								{#if grant.status === 'expired'}
									<p class="text-xs text-muted-foreground">
										This app can no longer read your views. Connect it again to give it access.
									</p>
								{/if}
							</Card.Header>
							<Card.Content class="grid gap-4">
								<div class="grid gap-2">
									<p class="text-xs font-medium text-muted-foreground">Allowed views</p>
									<ul
										class="flex flex-wrap gap-1.5"
										aria-label={`Views allowed for ${grant.clientName}`}
									>
										{#each grant.views as view (view.id)}
											<li class="max-w-full">
												<Badge variant="secondary" class="max-w-full break-words whitespace-normal"
													>{view.name}</Badge
												>
											</li>
										{/each}
									</ul>
									{#if !grant.views.length}<p class="text-xs text-muted-foreground">
											No saved views remain.
										</p>{/if}
								</div>
								<dl class="grid gap-1 text-xs text-muted-foreground">
									<div>
										<dt class="inline">Authorized:</dt>
										<dd class="inline">{date(grant.createdAt)}</dd>
									</div>
									<div>
										<dt class="inline">
											{grant.status === 'active' ? 'Expires:' : 'Expiry date:'}
										</dt>
										<dd class="inline">{date(grant.expiresAt)}</dd>
									</div>
								</dl>
								{#if confirming === grant.id}
									<div class="grid gap-3 rounded-lg border p-3">
										<p class="text-sm">
											Revoke access for {grant.clientName}? The app must connect again to read your
											views.
										</p>
										{#if revokeError}<p role="alert" class="text-sm text-destructive">
												{revokeError}
											</p>{/if}
										<div class="flex flex-wrap gap-2">
											<Button
												bind:ref={confirmButton}
												variant="destructive"
												class="min-h-11"
												disabled={revoking !== null}
												onclick={() => revoke(grant.id, grant.clientName)}
												>{revoking === grant.id ? 'Revoking…' : 'Confirm revocation'}</Button
											>
											<Button
												variant="outline"
												class="min-h-11"
												disabled={revoking !== null}
												onclick={() => {
													confirming = null;
													revokeError = '';
												}}>Cancel</Button
											>
										</div>
									</div>
								{:else}
									<div>
										<Button
											variant="outline"
											class="min-h-11"
											disabled={revoking !== null}
											onclick={() => confirmRevoke(grant.id)}
											aria-label={`Revoke access for ${grant.clientName}`}>Revoke access</Button
										>
									</div>
								{/if}
							</Card.Content>
						</Card.Root>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
