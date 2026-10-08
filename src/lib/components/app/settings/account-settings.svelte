<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { loadOrgs, orgNote, setOrgNoteOff } from '$lib/org-note.svelte';
	import { keys, leaveTo, meQuery, queryClient, sessionsQuery } from '$lib/queries';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { projectAccessOf } from '$lib/shared/projects';

	const me = createQuery(meQuery);
	const sessions = createQuery(sessionsQuery);
	const others = $derived((sessions.data ?? []).filter((x) => !x.current).length);

	async function endSession(id: string) {
		try {
			await api.endSession(id);
			await queryClient.invalidateQueries({ queryKey: keys.sessions });
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
	async function endOthers() {
		try {
			const { ended } = await api.endOtherSessions();
			await queryClient.invalidateQueries({ queryKey: keys.sessions });
			toast.success(
				ended === 1 ? 'Signed out 1 other browser' : `Signed out ${ended} other browsers`
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function signOut() {
		await api.logout().catch(() => {});
		leaveTo('/login');
	}

	// The orgs your sign-in can see: loaded when this page opens, unless this browser said
	// "Don't show again" (then only on request). GitHub omits orgs that have not approved Hush.
	const access = $derived(orgNote.access);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	async function showOrgs() {
		loading = true;
		loadError = null;
		try {
			await loadOrgs();
		} catch (err) {
			loadError = (err as Error).message;
		} finally {
			loading = false;
		}
	}
	// A switch back to GitHub sign-in that failed comes back here with ?token_error=.
	let switchError = $state<string | null>(null);
	onMount(() => {
		if (!orgNote.off || orgNote.access) showOrgs();
		const url = new URL(location.href);
		switchError = url.searchParams.get('token_error');
		if (switchError) {
			url.searchParams.delete('token_error');
			goto(url.pathname + url.search + url.hash, {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		}
	});

	// A custom token, in place of the one from your GitHub sign-in.
	const custom = $derived(me.data?.tokenSource === 'own');
	const projectAccess = $derived(projectAccessOf(me.data?.scopes ?? []));
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
			// The server syncs again and rebuilds the dashboards and teams with the new token.
			for (const queryKey of [keys.threadsAll, keys.dashAll, keys.teams])
				queryClient.invalidateQueries({ queryKey });
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
		try {
			await api.deleteAccount();
		} catch (err) {
			return void toast.error((err as Error).message);
		}
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
				<Card.Title>Signed in</Card.Title>
				<Card.Description
					>Each browser where you are signed in. A session ends after 7 days with no use, and 30
					days after sign-in.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid gap-3 text-sm">
				{#if sessions.data}
					<ul class="divide-y rounded-md border" aria-label="Sessions">
						{#each sessions.data as x (x.id)}
							<li class="flex items-center justify-between gap-3 px-3 py-2">
								<span class="min-w-0">
									<span class="block truncate"
										>{x.label ?? 'Browser'}
										{#if x.current}<span class="text-muted-foreground">(this browser)</span
											>{/if}</span
									>
									<span class="text-xs text-muted-foreground"
										>{x.current ? 'In use now' : `Last used ${ago(x.lastSeenAt)}`} · signed in {ago(
											x.createdAt
										)}</span
									>
								</span>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (x.current ? signOut() : endSession(x.id))}>Sign out</Button
								>
							</li>
						{/each}
					</ul>
					{#if others}
						<div>
							<Button variant="outline" size="sm" onclick={endOthers}
								>Sign out everywhere else</Button
							>
						</div>
					{/if}
				{:else if sessions.isPending}
					<p class="text-xs text-muted-foreground">Loading…</p>
				{/if}
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
				{#if switchError}
					<Alert.Root variant="destructive">
						<Alert.Description
							>Hush could not switch back to GitHub sign-in: {switchError}</Alert.Description
						>
					</Alert.Root>
				{/if}
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
					<span class="text-xs font-medium">Project boards</span>
					{#if projectAccess === 'edit'}
						<p class="text-xs leading-relaxed text-muted-foreground">
							Hush can read and change your GitHub projects: sources that use <code>status:</code>,
							and the status of an item in the peek.
						</p>
					{:else if custom}
						<p class="text-xs leading-relaxed text-muted-foreground">
							Your custom token has no <code>project</code> scope. Run
							<code>gh auth refresh -s project</code>, then replace the token with the one from
							<code>gh auth token</code>.
						</p>
					{:else}
						<p class="text-xs leading-relaxed text-muted-foreground">
							Optional. With project access, a source can find the items in a column of a project
							board, and the peek shows the item's status, which you can change.
						</p>
						<div>
							<Button
								variant="outline"
								size="sm"
								href="/api/auth/github?add=project"
								data-sveltekit-reload>Give project access</Button
							>
						</div>
					{/if}
				</div>
				<div class="grid gap-2 border-t pt-4">
					<span class="text-xs font-medium">Orgs your GitHub sign-in can see</span>
					{#if !access && orgNote.off && !loading}
						<p class="text-xs text-muted-foreground">
							<button
								type="button"
								class="underline underline-offset-2 hover:text-foreground"
								onclick={showOrgs}>Show the list</button
							>
						</p>
					{:else if loading && !access}
						<p class="text-xs text-muted-foreground">Loading…</p>
					{:else if loadError}
						<p class="text-xs text-destructive">{loadError}</p>
					{:else if access && !access.available}
						<p class="text-xs text-muted-foreground">Sign in with GitHub again to see this list.</p>
					{:else if access?.available}
						{#if access.orgs.length}
							<div class="flex flex-wrap gap-1.5">
								{#each access.orgs as org (org)}
									<Badge variant="secondary">{org}</Badge>
								{/each}
							</div>
						{:else}
							<p class="text-xs text-muted-foreground">None: only your own repositories.</p>
						{/if}
						<p class="text-xs leading-relaxed text-muted-foreground">
							Missing an org? GitHub hides every org that has not approved Hush, so Hush cannot list
							those.
							<a
								class="underline underline-offset-2 hover:text-foreground"
								href={access.approveUrl}
								target="_blank"
								rel="noreferrer">Request approval</a
							>{#if custom}. Your custom token can read it until then.{:else}, or use a custom token
								until then.{/if}
							{#if orgNote.off}
								<button
									type="button"
									class="underline underline-offset-2 hover:text-foreground"
									onclick={() => setOrgNoteOff(false)}>Show the note after sign-in again</button
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
