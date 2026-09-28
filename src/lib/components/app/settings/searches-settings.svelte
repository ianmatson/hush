<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, meQuery, queryClient, teamsQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_SEARCHES } from '$lib/shared/settings';
	import type { TrackedSearch } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import SectionEditor from '$lib/components/app/section-editor.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	/**
	 * Where Hush looks besides your notifications: GitHub searches for old review requests, your
	 * open PRs, what is assigned to you. And your teams, for @team and team review requests.
	 */
	const me = createQuery(meQuery);
	const teams = createQuery(teamsQuery);

	type Draft = { searches: TrackedSearch[]; searchScope: string; excludedTeams: string[] };
	let draft = $state<Draft | null>(null);
	let saved = $state('');
	$effect(() => {
		const s = me.data?.settings;
		untrack(() => {
			if (s && !draft) {
				draft = structuredClone({
					searches: $state.snapshot(s.searches),
					searchScope: s.searchScope,
					excludedTeams: $state.snapshot(s.excludedTeams)
				});
				saved = JSON.stringify(draft);
			}
		});
	});
	const dirty = $derived(!!draft && JSON.stringify(draft) !== saved);
	let saving = $state(false);
	let refreshingTeams = $state(false);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Leave without saving your search changes?')) nav.cancel();
	});

	async function save() {
		if (!draft) return;
		saving = true;
		if (await saveSettings($state.snapshot(draft), 'Searches saved')) saved = JSON.stringify(draft);
		saving = false;
	}
	async function refreshTeams() {
		refreshingTeams = true;
		try {
			const res = await api.teams(true);
			queryClient.setQueryData(keys.teams, res);
			toast.success(`Found ${res.teams.length} team${res.teams.length === 1 ? '' : 's'}.`);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			refreshingTeams = false;
		}
	}
	function toggleTeam(slug: string, tracked: boolean) {
		if (!draft) return;
		draft.excludedTeams = tracked
			? draft.excludedTeams.filter((t) => t !== slug)
			: [...draft.excludedTeams, slug];
	}
	const previewTeam = $derived(
		teams.data?.teams.find((t) => !draft?.excludedTeams.includes(t.slug))?.slug ?? null
	);
</script>

{#if draft}
	<Card.Root id="searches" class="scroll-mt-20">
		<Card.Header>
			<div class="flex items-start justify-between gap-3">
				<div class="grid gap-1.5">
					<Card.Title>Where Hush looks</Card.Title>
					<Card.Description>
						Besides your notifications, Hush runs these <a
							class="underline underline-offset-2"
							href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
							target="_blank"
							rel="noreferrer">GitHub searches</a
						>
						every 15 minutes, to find items with no recent notification. <code>@me</code> is you;
						<code>@team</code> runs once for each team you track.
					</Card.Description>
				</div>
				<Button
					variant="ghost"
					size="xs"
					onclick={() => draft && (draft.searches = structuredClone(DEFAULT_SEARCHES))}
				>
					<RotateCcw /> Defaults
				</Button>
			</div>
		</Card.Header>
		<Card.Content class="grid gap-6">
			<SectionEditor bind:sections={draft.searches} scope={draft.searchScope} {previewTeam} />
			<div class="grid gap-1.5">
				<label for="scope" class="text-sm font-medium">Scope</label>
				<Input id="scope" bind:value={draft.searchScope} placeholder="org:acme archived:false" />
				<p class="text-xs text-muted-foreground">
					Added to every search. For example <code>org:acme</code>, or
					<code>-repo:acme/website</code>.
				</p>
			</div>
			<div class="grid gap-2">
				<p class="text-sm font-medium">Teams</p>
				<p class="text-xs text-muted-foreground">
					Review requests to the teams you track wait on the team (or are your turn, with the
					setting on). Turn off big teams, such as “everyone”, to cut noise.
				</p>
				{#if teams.data?.error}
					<Alert.Root variant="destructive"
						><Alert.Description>{teams.data.error}</Alert.Description></Alert.Root
					>
				{/if}
				{#if teams.isPending}
					<p class="text-sm text-muted-foreground">Loading your teams…</p>
				{:else if !teams.data?.teams.length}
					<p class="text-sm text-muted-foreground">
						GitHub reports no teams for you. The token needs the <code>read:org</code> scope, and SAML
						orgs must authorize it.
					</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each teams.data.teams as t (t.slug)}
							<li class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
								<span class="min-w-0 truncate"
									><span class="font-medium">{t.name}</span>
									<span class="text-xs text-muted-foreground">{t.slug}</span></span
								>
								<Switch
									checked={!draft.excludedTeams.includes(t.slug)}
									onCheckedChange={(v) => toggleTeam(t.slug, v)}
									aria-label="Track {t.slug}"
								/>
							</li>
						{/each}
					</ul>
				{/if}
				<div>
					<Button variant="ghost" size="sm" onclick={refreshTeams} disabled={refreshingTeams}>
						<RefreshCw /> Look up teams again
					</Button>
				</div>
			</div>
		</Card.Content>
		<Card.Footer class="border-t">
			<div class="ml-auto flex items-center gap-2">
				{#if dirty}
					<Button variant="ghost" size="sm" onclick={() => (draft = JSON.parse(saved))}
						>Discard</Button
					>
				{/if}
				<Button size="sm" onclick={save} disabled={!dirty || saving}>Save</Button>
			</div>
		</Card.Footer>
	</Card.Root>
{/if}
