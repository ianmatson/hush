<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { toast } from 'svelte-sonner';
	import { keys, leaveTo, meQuery, queryClient } from '$lib/queries';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';

	const me = createQuery(meQuery);

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}

	// Your own token, in place of the one from Sign in with GitHub.
	let token = $state('');
	let saving = $state(false);
	async function useToken(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			await api.setToken(token.trim());
			token = '';
			toast.success('Hush now uses your token. It syncs again with it.');
			await queryClient.invalidateQueries({ queryKey: keys.me });
			queryClient.invalidateQueries({ queryKey: keys.threadsAll });
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
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

<div class="grid gap-6">
	<div>
		<h2 class="text-base font-semibold tracking-tight">Account</h2>
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
					<Button variant="outline" size="sm" onclick={signOut}>Sign out</Button>
					<Button variant="destructive" size="sm" onclick={deleteAccount}>Delete account</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Signing out also clears Hush data cached in this browser.
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>GitHub token</Card.Title>
				<Card.Description>
					{#if me.data.tokenSource === 'own'}
						Hush reads GitHub with the token you added.
					{:else}
						Hush reads GitHub with the token from Sign in with GitHub.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4 text-sm">
				<details class="text-muted-foreground">
					<summary class="cursor-pointer select-none">Why add your own token?</summary>
					<div class="mt-2 grid gap-2 text-xs leading-relaxed">
						<p>
							Many orgs allow only the apps that an owner approved. Until an owner of your org
							approves Hush, GitHub hides that org's private repositories and notifications from the
							token that Sign in with GitHub gives Hush.
						</p>
						<p>
							A token from an app your org already approved fills the gap. For example, if your org
							approved the GitHub CLI, run <code>gh auth token</code> and paste the result (it
							starts with <code>gho_</code>). A classic token with <code>notifications</code>,
							<code>repo</code>, and <code>read:org</code> works too, if your org allows them. Fine-grained
							tokens cannot read notifications.
						</p>
						<p>
							The token must be for @{me.data.login}. Hush stores it encrypted, and signing in again
							keeps it.
						</p>
					</div>
				</details>
				<form class="flex flex-wrap gap-2" onsubmit={useToken}>
					<Input
						type="password"
						autocomplete="off"
						spellcheck={false}
						placeholder="gho_… or ghp_…"
						aria-label="Your GitHub token"
						class="h-8 min-w-0 flex-1"
						bind:value={token}
					/>
					<Button type="submit" size="sm" disabled={saving || token.trim().length < 20}
						>Use this token</Button
					>
				</form>
				{#if me.data.tokenSource === 'own'}
					<p class="text-xs text-muted-foreground">
						<a
							class="underline underline-offset-2 hover:text-foreground"
							href="/api/auth/github?use=app"
							data-sveltekit-reload>Use the Sign in with GitHub token again</a
						> (GitHub asks you to confirm).
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
