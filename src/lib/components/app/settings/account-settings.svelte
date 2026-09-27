<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { OrgAccess } from '$lib/shared/types';
	import { checkOrgAccess, orgWarning, setOrgWarningOff } from '$lib/org-warning.svelte';
	import { keys, leaveTo, meQuery, queryClient } from '$lib/queries';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';

	const me = createQuery(meQuery);

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}

	// Which orgs hide their data from your sign-in: checked when this page opens, unless this
	// browser said "Don't show again" (then only with "Check now").
	let access = $state<OrgAccess | null>(null);
	let checking = $state(false);
	async function runCheck() {
		checking = true;
		try {
			access = await checkOrgAccess();
		} catch {
			access = null;
		} finally {
			checking = false;
		}
	}
	onMount(() => {
		if (!orgWarning.off) runCheck();
	});

	// A custom token, in place of the one from your GitHub sign-in.
	const custom = $derived(me.data?.tokenSource === 'own');
	let editing = $state(false);
	let token = $state('');
	let saving = $state(false);
	async function useToken(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			await api.setToken(token.trim());
			token = '';
			editing = false;
			toast.success('Hush now uses your custom token, and syncs again with it.');
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

		<Card.Root id="token" class="scroll-mt-20">
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					GitHub access
					{#if custom}
						<Badge variant="outline" class="border-signal-warn/50 text-signal-warn"
							><KeyRound class="size-3" />Custom token</Badge
						>
					{:else}
						<Badge variant="outline"
							><svg viewBox="0 0 16 16" class="size-3" aria-hidden="true" fill="currentColor"
								><path
									d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
								/></svg
							>GitHub sign-in</Badge
						>
					{/if}
				</Card.Title>
				<Card.Description>
					{#if custom}
						Hush reads GitHub with a custom token that you added, not with your GitHub sign-in.
					{:else}
						Hush reads GitHub with your GitHub sign-in.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4 text-sm">
				{#if !editing}
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onclick={() => (editing = true)}
							>{custom ? 'Replace the token…' : 'Use a custom token…'}</Button
						>
						{#if custom}
							<Button
								variant="ghost"
								size="sm"
								href="/api/auth/github?use=app"
								data-sveltekit-reload>Switch back to GitHub sign-in</Button
							>
						{/if}
					</div>
					{#if !custom}
						<p class="text-xs text-muted-foreground">
							Only if an org hides its repositories from Hush: see below.
						</p>
					{/if}
				{:else}
					<form class="grid gap-3" onsubmit={useToken}>
						<p class="text-xs leading-relaxed text-muted-foreground">
							Paste a token for <b class="font-medium text-foreground">@{me.data.login}</b> that can
							read notifications. For example, run <code>gh auth token</code> (GitHub CLI), or make
							a classic token with <code>notifications</code>, <code>repo</code>, and
							<code>read:org</code>. Hush stores it encrypted, and signing in again keeps it.
						</p>
						<div class="flex flex-wrap gap-2">
							<Input
								type="password"
								autocomplete="off"
								spellcheck={false}
								placeholder="gho_… or ghp_…"
								aria-label="Custom token"
								class="h-8 min-w-0 flex-1"
								bind:value={token}
							/>
							<Button type="submit" size="sm" disabled={saving || token.trim().length < 20}
								>Save</Button
							>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									editing = false;
									token = '';
								}}>Cancel</Button
							>
						</div>
					</form>
				{/if}
				<div class="grid gap-2 border-t pt-4">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs font-medium">Org access</span>
						{#if access?.available}<span class="text-xs text-muted-foreground"
								>Checked {ago(access.checkedAt)}</span
							>{/if}
					</div>
					{#if orgWarning.off && !access}
						<p class="text-xs text-muted-foreground">
							Warnings are off in this browser.
							<button
								type="button"
								class="underline underline-offset-2 hover:text-foreground"
								onclick={runCheck}>Check now</button
							>
							·
							<button
								type="button"
								class="underline underline-offset-2 hover:text-foreground"
								onclick={() => {
									setOrgWarningOff(false);
									runCheck();
								}}>Show warnings again</button
							>
						</p>
					{:else if checking && !access}
						<p class="text-xs text-muted-foreground">Checking your orgs…</p>
					{:else if access && !access.available}
						<p class="text-xs text-muted-foreground">
							Sign in again to check which orgs share their repositories with Hush.
						</p>
					{:else if access?.available && !access.gaps.length}
						<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Check class="size-3.5 text-signal-merge" />Every org you are in shares its
							repositories with your sign-in.{#if custom}
								You can switch back to GitHub sign-in.{/if}
						</p>
					{:else if access?.available}
						<ul class="grid gap-1.5">
							{#each access.gaps as g (g.org)}
								<li class="flex flex-wrap items-baseline gap-x-2 text-xs">
									<TriangleAlert class="size-3.5 translate-y-0.5 text-signal-warn" />
									<span class="font-medium">{g.org}</span>
									<span class="text-muted-foreground"
										>{g.reason === 'not_approved'
											? 'has not approved Hush yet.'
											: g.reason === 'sso'
												? 'needs you to authorize Hush for its single sign-on.'
												: g.message}</span
									>
									<a
										class="underline underline-offset-2"
										href={access.approveUrl}
										target="_blank"
										rel="noreferrer">{g.reason === 'sso' ? 'Authorize' : 'Request approval'}</a
									>
								</li>
							{/each}
						</ul>
						<p class="text-xs text-muted-foreground">
							{#if custom}
								Your custom token can cover these orgs until they approve Hush.
							{:else}
								GitHub hides their private repositories and notifications from Hush. A custom token
								can cover them until they approve Hush.
							{/if}
							{#if !orgWarning.off}
								<button
									type="button"
									class="underline underline-offset-2 hover:text-foreground"
									onclick={() => setOrgWarningOff(true)}>Don't show again</button
								>
							{/if}
						</p>
					{/if}
				</div>
				<details class="text-xs text-muted-foreground">
					<summary class="cursor-pointer select-none">When do I need a custom token?</summary>
					<p class="mt-2 leading-relaxed">
						Many orgs allow only the apps that an owner approved. Until an owner of your org
						approves Hush, GitHub hides that org's private repositories and notifications from your
						sign-in. A token from an app the org already approved (such as the GitHub CLI), or a
						classic token if the org allows them, lets Hush see them. When the org approves Hush,
						switch back to GitHub sign-in.
					</p>
				</details>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
