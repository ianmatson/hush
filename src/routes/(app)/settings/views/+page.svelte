<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { feedsQuery, keys, meQuery, queryClient, teamsQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { validateDash } from '$lib/shared/dashboard';
	import { DEFAULT_VIEWS, MAX_VIEWS, validateViews } from '$lib/shared/item-views';
	import type { DashSettings, ItemView } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import ViewCard from '$lib/components/app/view-card.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Plus from '@lucide/svelte/icons/plus';

	const me = createQuery(meQuery);
	const teams = createQuery(teamsQuery);
	const feeds = createQuery(feedsQuery);

	interface Draft {
		dash: DashSettings;
		views: ItemView[];
	}
	let draft = $state<Draft | null>(null);
	let saved = $state('');
	const savedIds = $derived(new Set((me.data?.settings.views ?? []).map((v) => v.id)));
	$effect(() => {
		const settings = me.data?.settings;
		untrack(() => {
			if (settings && !draft) {
				const initial: Draft = { dash: settings.dash, views: settings.views };
				draft = structuredClone($state.snapshot(initial));
				saved = JSON.stringify(initial);
				if (page.url.searchParams.get('new') === '1') {
					addView();
					goto('/settings/views', { replaceState: true, noScroll: true, keepFocus: true });
				} else if (page.url.hash) void tick().then(() => scrollTo(page.url.hash.slice(1)));
			}
		});
	});
	const dirty = $derived(!!draft && JSON.stringify(draft) !== saved);
	const error = $derived(draft ? (validateDash(draft.dash) ?? validateViews(draft.views)) : null);
	let saving = $state(false);
	let refreshingTeams = $state(false);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Leave without saving your view changes?')) nav.cancel();
	});

	function scrollTo(elementId: string) {
		document.getElementById(elementId)?.scrollIntoView({ block: 'start' });
	}

	function addView() {
		if (!draft) return;
		const id = `view-${Math.random().toString(36).slice(2, 8)}`;
		draft.views = [
			...draft.views,
			{ id, name: 'New view', searches: ['is:open'], groupBy: 'status' }
		];
		void tick().then(() => {
			scrollTo(`view-${id}`);
			document.querySelector<HTMLInputElement>(`[data-view="${id}"]`)?.select();
		});
	}

	function moveView(index: number, by: number) {
		if (!draft) return;
		const list = [...draft.views];
		const [v] = list.splice(index, 1);
		list.splice(index + by, 0, v);
		draft.views = list;
	}

	async function save() {
		if (!draft || error) return;
		saving = true;
		if (await saveSettings($state.snapshot(draft), 'Views saved')) saved = JSON.stringify(draft);
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
		draft.dash.excludedTeams = tracked
			? draft.dash.excludedTeams.filter((t) => t !== slug)
			: [...draft.dash.excludedTeams, slug];
	}

	const previewTeam = $derived(
		teams.data?.teams.find((t) => !draft?.dash.excludedTeams.includes(t.slug))?.slug ?? null
	);
</script>

<svelte:head><title>Views · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Views</h1>
		<p class="text-sm text-muted-foreground">
			Each view is a tab in the top bar. It shows the open pull requests and issues that its <a
				class="underline"
				href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
				target="_blank"
				rel="noreferrer">GitHub searches</a
			>
			find. <code>@me</code> is you, and <code>@team</code> is each tracked team.
		</p>
	</div>

	{#if draft}
		{#each draft.views as v, index (v.id)}
			<ViewCard
				bind:view={draft.views[index]}
				first={index === 0}
				last={index === draft.views.length - 1}
				hasFeed={savedIds.has(v.id)}
				{previewTeam}
				feeds={feeds.data}
				onmove={(by) => moveView(index, by)}
				ondelete={() => draft && (draft.views = draft.views.filter((x) => x.id !== v.id))}
			/>
		{/each}

		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={addView}
				disabled={draft.views.length >= MAX_VIEWS}><Plus /> Add view</Button
			>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => draft && (draft.views = structuredClone(DEFAULT_VIEWS))}
			>
				<RotateCcw /> Defaults
			</Button>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Teams</Card.Title>
				<Card.Description>
					Searches with <code>@team</code> run once for each tracked team. Turn off big teams (e.g. “everyone”)
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
									checked={!draft.dash.excludedTeams.includes(t.slug)}
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
				<Card.Title>Filters</Card.Title>
			</Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					id="hide-bots"
					label="Hide PRs and issues that bots opened"
					description="For example dependabot, renovate, and GitHub Apps. Hush does not track them, so their notifications do not come in to the inbox either. An item that requests your review by name, or that is assigned to you, always shows."
				>
					<Switch id="hide-bots" bind:checked={draft.dash.hideBots} />
				</SettingRow>
				<SettingRow
					id="hide-others-drafts"
					label="Hide drafts that others opened"
					description="Draft PRs show only when you opened them."
				>
					<Switch id="hide-others-drafts" bind:checked={draft.dash.hideOthersDrafts} />
				</SettingRow>
			</Card.Content>
		</Card.Root>

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
