<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { loadOrgs, orgNote, setOrgNoteOff } from '$lib/org-note.svelte';
	import { keys, leaveTo, meQuery, queryClient, sessionsQuery, signOut } from '$lib/queries';
	import { takeSearchParams } from '$lib/search-params';
	import { GITHUB_MARK } from '$lib/components/site/github-mark';
	import { ago } from '$lib/time';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ListSkeleton from './list-skeleton.svelte';
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

	// The orgs your sign-in can see: loaded when this page opens, unless this browser said
	// "Don't show again" (then only on request). GitHub omits orgs that have not approved Hush.
	const access = $derived(orgNote.access);
	const ORG_SKELETON_WIDTHS = ['w-16', 'w-20', 'w-14'];
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
		switchError = takeSearchParams('token_error').token_error;
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
			for (const queryKey of [keys.items, keys.teams]) queryClient.invalidateQueries({ queryKey });
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
					<ListSkeleton label="Loading sessions" />
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
								><path d={GITHUB_MARK} /></svg
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
							a classic token with <code>notifications</code>, <code>repo</code>,
							<code>read:org</code>, and <code>project</code>. Hush stores it encrypted, and signing
							in again keeps it.
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
				{#if projectAccess !== 'edit'}
					<p class="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
						{#if custom}
							Your custom token cannot change project boards. Run
							<code>gh auth refresh -s project</code>, then replace the token with the one from
							<code>gh auth token</code>.
						{:else}
							Your token is older than project boards in Hush.
							<a
								class="underline underline-offset-2 hover:text-foreground"
								href="/api/auth/github?use=app"
								data-sveltekit-reload>Sign in with GitHub again</a
							> to use them.
						{/if}
					</p>
				{/if}
				<div class="grid gap-2 border-t pt-4">
					<span class="text-xs font-medium">Orgs your GitHub sign-in can see</span>
					{#snippet missingOrgHelp(approveUrl?: string)}
						<p class="text-xs leading-relaxed text-muted-foreground">
							Missing an org? GitHub hides every org that has not approved Hush, so Hush cannot list
							those.
							<a
								class="underline underline-offset-2 hover:text-foreground"
								href={approveUrl}
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
					{/snippet}
					{#if !access && orgNote.off && !loading}
						<p class="text-xs text-muted-foreground">
							<button
								type="button"
								class="underline underline-offset-2 hover:text-foreground"
								onclick={showOrgs}>Show the list</button
							>
						</p>
					{:else if loading && !access}
						<div role="status" aria-label="Loading orgs" class="flex flex-wrap gap-1.5">
							{#each ORG_SKELETON_WIDTHS as width (width)}
								<Skeleton class="h-5 rounded-full {width}" />
							{/each}
						</div>
						{@render missingOrgHelp()}
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
						{@render missingOrgHelp(access.approveUrl)}
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
