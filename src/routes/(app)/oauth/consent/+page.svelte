<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ApiError } from '$lib/api';
	import { mcpApi } from '$lib/mcp-api';
	import type { McpConsentDTO } from '$lib/shared/mcp';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	const EXPIRED_MESSAGE = 'This request expired. Connect the app again.';
	const UNAUTHORIZED = 401;

	let data = $state<McpConsentDTO | null>(null);
	let selected = $state<string[]>([]);
	let loading = $state(true);
	let submitting = $state<'allow' | 'deny' | null>(null);
	let error = $state('');
	let signedOut = $state(false);
	let submitError = $state('');
	let expired = $state(false);
	let expiryTimer: ReturnType<typeof setTimeout> | undefined;
	const requestId = $derived(page.url.searchParams.get('request') ?? '');
	const returnOrigin = $derived(data ? new URL(data.client.redirectUri).origin : '');
	const expiresAt = $derived(
		data
			? new Date(data.expiresAt).toLocaleTimeString(undefined, {
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	function watchExpiry(at: number) {
		clearTimeout(expiryTimer);
		expired = at <= Date.now();
		if (!expired) expiryTimer = setTimeout(() => (expired = true), at - Date.now());
	}

	async function load() {
		loading = true;
		error = '';
		signedOut = false;
		selected = [];
		data = null;
		try {
			if (!requestId)
				throw new Error('This authorization link is incomplete. Connect the app again.');
			const consent = await mcpApi.consent(requestId);
			if (consent.expiresAt <= Date.now()) throw new Error(EXPIRED_MESSAGE);
			if (!URL.canParse(consent.client.redirectUri))
				throw new Error('The app sent an invalid return address. Connect the app again.');
			data = consent;
			watchExpiry(consent.expiresAt);
		} catch (err) {
			data = null;
			signedOut = err instanceof ApiError && err.status === UNAUTHORIZED;
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	async function decide(decision: 'allow' | 'deny') {
		if (!data || submitting || expired || (decision === 'allow' && !selected.length)) return;
		submitting = decision;
		submitError = '';
		try {
			const { redirectTo } = await mcpApi.decide({
				requestId: data.requestId,
				csrfToken: data.csrfToken,
				viewIds: decision === 'allow' ? selected : [],
				decision
			});
			const destination = new URL(redirectTo, location.origin);
			if (!['https:', 'http:'].includes(destination.protocol))
				throw new Error('The app returned an invalid redirect address.');
			location.assign(destination.href);
		} catch (err) {
			submitError = (err as Error).message;
			submitting = null;
		}
	}

	onMount(() => {
		load();
		return () => clearTimeout(expiryTimer);
	});
</script>

<svelte:head
	><title>Authorize an app · Hush</title><meta name="referrer" content="no-referrer" /></svelte:head
>

<main class="mx-auto grid max-w-xl gap-6 px-4 pt-8 pb-24 sm:pt-12">
	<div class="flex items-start gap-3">
		<ShieldCheck class="mt-1 size-7 shrink-0 text-muted-foreground" aria-hidden="true" />
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Authorize an app</h1>
			<p class="mt-1 text-sm text-muted-foreground">Choose what this app can read from Hush.</p>
		</div>
	</div>
	{#if loading}
		<p role="status" class="text-sm text-muted-foreground">Loading authorization request…</p>
	{:else if signedOut}
		<Alert.Root>
			<Alert.Title>Sign in to Hush first</Alert.Title>
			<Alert.Description
				>Sign in, then start the connection again from the app. Hush cannot continue this request
				after you sign in.</Alert.Description
			>
			<div class="mt-2">
				<Button href="/api/auth/github" data-sveltekit-reload class="min-h-11"
					>Sign in with GitHub</Button
				>
			</div>
		</Alert.Root>
	{:else if error}
		<Alert.Root variant="destructive">
			<Alert.Title>Cannot authorize this app</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
			<div class="mt-2">
				<Button variant="outline" class="min-h-11" onclick={load}>Retry</Button>
			</div>
		</Alert.Root>
	{:else if data}
		<Card.Root>
			<Card.Header>
				<Card.Title class="break-words"
					>{data.client.name} wants to read your saved views</Card.Title
				>
				<Card.Description
					>The app chose this name. Hush did not verify it. Only approve this request if you started
					it in this app.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid gap-4 text-sm">
				<div class="grid gap-1 rounded-lg border p-3">
					<p class="font-medium">After you decide, Hush sends you to</p>
					<p><code class="font-semibold break-all">{returnOrigin}</code></p>
					<p class="text-xs text-muted-foreground">
						Full return address: <code class="break-all">{data.client.redirectUri}</code>
					</p>
				</div>
				<div class="grid gap-1 rounded-lg bg-muted/50 p-3">
					<p class="font-medium">Read-only access <code class="text-xs">{data.scope}</code></p>
					<p class="text-muted-foreground">
						The app can read cached pull requests and issues from the views you choose, including
						private repository data in those views. It cannot change GitHub or your Hush settings.
					</p>
				</div>
				<div class="grid gap-1 text-xs text-muted-foreground">
					<p>App ID: <code class="break-all">{data.client.id}</code></p>
					{#if !expired}<p>This request expires at {expiresAt}.</p>{/if}
				</div>
				{#if expired}
					<Alert.Root variant="destructive">
						<Alert.Title>Request expired</Alert.Title>
						<Alert.Description>{EXPIRED_MESSAGE}</Alert.Description>
					</Alert.Root>
				{/if}
				<form
					class="grid gap-4"
					onsubmit={(event) => {
						event.preventDefault();
						decide('allow');
					}}
				>
					<fieldset
						class="grid min-w-0 gap-2"
						disabled={submitting !== null || expired}
						aria-describedby="view-selection-help"
					>
						<legend class="mb-1 font-medium">Allowed saved views</legend>
						<p id="view-selection-help" class="mb-1 text-xs text-muted-foreground">
							Choose at least one view. New views are not included automatically.
						</p>
						{#each data.views as view (view.id)}
							<label
								for={`view-${view.id}`}
								class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
							>
								<Checkbox
									id={`view-${view.id}`}
									class="mt-0.5"
									checked={selected.includes(view.id)}
									onCheckedChange={(checked) => {
										selected = checked
											? [...selected, view.id]
											: selected.filter((id) => id !== view.id);
									}}
								/>
								<span class="grid min-w-0 gap-1">
									<span class="font-medium break-words">{view.name}</span>
									{#each view.searches as search}<code
											class="text-xs break-all text-muted-foreground">{search}</code
										>{/each}
								</span>
							</label>
						{/each}
						{#if !data.views.length}<p class="text-muted-foreground">
								No saved views are available. Add a view in Hush, then connect this app again.
							</p>{/if}
					</fieldset>
					{#if submitError}<p role="alert" class="text-sm text-destructive">{submitError}</p>{/if}
					<div class="flex flex-wrap gap-2">
						<Button
							type="submit"
							class="min-h-11"
							disabled={!selected.length || submitting !== null || expired}
							>{submitting === 'allow' ? 'Authorizing…' : 'Authorize selected views'}</Button
						>
						<Button
							variant="outline"
							class="min-h-11"
							disabled={submitting !== null || expired}
							onclick={() => decide('deny')}
							>{submitting === 'deny' ? 'Declining…' : 'Deny access'}</Button
						>
					</div>
				</form>
				<p class="text-xs text-muted-foreground">
					You can revoke access in <a class="underline underline-offset-2" href="/settings/apps"
						>Settings → Authorized apps</a
					>.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
