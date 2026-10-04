<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, meQuery, queryClient, teamsQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { DEFAULT_ISSUE_SECTIONS, DEFAULT_PR_SECTIONS, validateDash } from '$lib/shared/dashboard';
	import type { DashSettings } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import SectionEditor from '$lib/components/app/section-editor.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

	const me = createQuery(meQuery);
	const teams = createQuery(teamsQuery);

	// A local draft; nothing is saved until you press Save.
	let draft = $state<DashSettings | null>(null);
	let saved = $state('');
	$effect(() => {
		const dash = me.data?.settings.dash;
		untrack(() => {
			if (dash && !draft) {
				draft = structuredClone($state.snapshot(dash));
				saved = JSON.stringify(dash);
			}
		});
	});
	const dirty = $derived(!!draft && JSON.stringify(draft) !== saved);
	const error = $derived(draft ? validateDash(draft) : null);
	let saving = $state(false);
	let refreshingTeams = $state(false);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Leave without saving your section changes?')) nav.cancel();
	});

	async function save() {
		if (!draft || error) return;
		saving = true;
		if (await saveSettings({ dash: $state.snapshot(draft) }, 'Sections saved'))
			saved = JSON.stringify(draft);
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

<svelte:head><title>PRs & issues · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div class="flex items-end justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">PRs & issues</h1>
			<p class="text-sm text-muted-foreground">
				The Pull requests and Issues tabs are saved GitHub searches. Hush groups the results by
				whose turn it is.
			</p>
		</div>
	</div>

	{#if draft}
		<Card.Root>
			<Card.Header>
				<Card.Title>Teams</Card.Title>
				<Card.Description>
					Sections with <code>@team</code> run once for each tracked team. Turn off big teams (e.g. “everyone”)
					to cut noise.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
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
					<ul class="grid gap-1 sm:grid-cols-2">
						{#each teams.data.teams as t (t.slug)}
							<li
								class="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
							>
								<span class="min-w-0 truncate"
									><span class="font-medium">{t.name}</span>
									<span class="font-mono text-xs text-muted-foreground">{t.slug}</span></span
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
						<RefreshCw class={refreshingTeams ? 'animate-spin' : ''} /> Look up teams again
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Scope</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-1.5">
					<label for="scope" class="sr-only">Scope</label>
					<Input
						id="scope"
						bind:value={draft.scope}
						class="h-8 font-mono text-xs"
						placeholder="org:acme archived:false"
					/>
					<p class="text-xs text-muted-foreground">
						Added to every search. For example <code>org:acme</code>, or
						<code>-repo:acme/website</code>. Drafts, bots, and “stale after” are in settings.json
						(General).
					</p>
				</div>
			</Card.Content>
		</Card.Root>

		{#each [{ kind: 'pr', title: 'Pull request sections', defaults: DEFAULT_PR_SECTIONS }, { kind: 'issue', title: 'Issue sections', defaults: DEFAULT_ISSUE_SECTIONS }] as const as g (g.kind)}
			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between gap-2">
						<div class="grid gap-1.5">
							<Card.Title>{g.title}</Card.Title>
							<Card.Description>
								Any <a
									class="underline"
									href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
									target="_blank"
									rel="noreferrer">GitHub search</a
								>.
								<code>@me</code> is you. <code>@team</code> is each tracked team.
							</Card.Description>
						</div>
						<Button
							variant="ghost"
							size="xs"
							onclick={() => draft && (draft[g.kind] = structuredClone(g.defaults))}
						>
							<RotateCcw /> Defaults
						</Button>
					</div>
				</Card.Header>
				<Card.Content class="grid gap-3">
					<SectionEditor
						kind={g.kind}
						bind:sections={draft[g.kind]}
						scope={draft.scope}
						{previewTeam}
					/>
				</Card.Content>
			</Card.Root>
		{/each}

		<div
			class="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/90 p-3 shadow-sm backdrop-blur"
			class:hidden={!dirty}
		>
			{#if error}<p class="mr-auto text-xs text-destructive">{error}</p>{:else}<p
					class="mr-auto text-xs text-muted-foreground"
				>
					You have unsaved changes.
				</p>{/if}
			<Button variant="ghost" size="sm" onclick={() => (draft = JSON.parse(saved))}>Discard</Button>
			<Button size="sm" onclick={save} disabled={!!error || saving}>Save</Button>
		</div>
	{/if}
</div>
