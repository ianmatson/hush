<script lang="ts">
	import { SITE_URL } from '$lib/site';
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { feedsQuery, keys, meQuery, queryClient, teamsQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { createSettingsDraft } from '$lib/settings-draft.svelte';
	import { takeSearchParams } from '$lib/search-params';
	import { moveItem, randomId } from '$lib/draft-edits';
	import { validateDash } from '$lib/shared/dashboard';
	import { DEFAULT_VIEWS, MAX_VIEWS, validateViews } from '$lib/shared/item-views';
	import { settingsChanges } from '$lib/shared/settings-schema';
	import type { DashSettings, ItemView } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TextSkeleton from '$lib/components/app/settings/text-skeleton.svelte';
	import ViewCard from '$lib/components/app/view-card.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import UnsavedChangesBar from '$lib/components/app/settings/unsaved-changes-bar.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Plus from '@lucide/svelte/icons/plus';

	const NEW_VIEW_PARAM = 'new';

	const me = createQuery(meQuery);
	const teams = createQuery(teamsQuery);
	const TEAM_SKELETON_ROWS = [0, 1, 2, 3];
	const feeds = createQuery(feedsQuery);

	interface ViewsDraft {
		dash: DashSettings;
		views: ItemView[];
	}
	const editor = createSettingsDraft<ViewsDraft>({
		saved: () => {
			const settings = me.data?.settings;
			return settings && { dash: settings.dash, views: settings.views };
		},
		save: (next, base) => saveSettings(settingsChanges(base, next), 'Views saved')
	});
	const savedIds = $derived(new Set((me.data?.settings.views ?? []).map((v) => v.id)));
	const loaded = $derived(!!editor.draft);
	const error = $derived(
		editor.draft ? (validateDash(editor.draft.dash) ?? validateViews(editor.draft.views)) : null
	);
	let refreshingTeams = $state(false);

	$effect(() => {
		if (!loaded) return;
		const { hash } = page.url;
		untrack(() => {
			if (takeSearchParams(NEW_VIEW_PARAM)[NEW_VIEW_PARAM] === '1') addView();
			else if (hash) void tick().then(() => scrollTo(hash.slice(1)));
		});
	});

	function scrollTo(elementId: string) {
		document.getElementById(elementId)?.scrollIntoView({ block: 'start' });
	}

	function addView() {
		const draft = editor.draft;
		if (!draft) return;
		const id = randomId('view');
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
		const draft = editor.draft;
		if (draft) draft.views = moveItem(draft.views, index, by);
	}

	function deleteView(id: string) {
		const draft = editor.draft;
		if (draft) draft.views = draft.views.filter((x) => x.id !== id);
	}

	function resetViews() {
		const draft = editor.draft;
		if (draft) draft.views = structuredClone(DEFAULT_VIEWS);
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
		const draft = editor.draft;
		if (!draft) return;
		draft.dash.excludedTeams = tracked
			? draft.dash.excludedTeams.filter((t) => t !== slug)
			: [...draft.dash.excludedTeams, slug];
	}

	const previewTeam = $derived(
		teams.data?.teams.find((t) => !editor.draft?.dash.excludedTeams.includes(t.slug))?.slug ?? null
	);
</script>

<svelte:head><title>Views · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Views</h1>
		<p class="text-sm text-muted-foreground">
			Each view is a tab in the top bar. It shows the open pull requests and issues that its
			searches find. Hush sends the GitHub words of a search to GitHub, then keeps the results that
			match its Hush words, such as <code>size:&lt;50</code>. See the
			<a
				class="underline"
				href="{SITE_URL}/docs/query-language#in-a-views-search"
				target="_blank"
				rel="noreferrer">query language</a
			>. <code>@me</code> is you, and <code>@team</code> is each tracked team.
		</p>
	</div>

	{#if editor.draft}
		{@const draft = editor.draft}
		{#each draft.views as v, index (v.id)}
			<ViewCard
				bind:view={draft.views[index]}
				first={index === 0}
				last={index === draft.views.length - 1}
				hasFeed={savedIds.has(v.id)}
				{previewTeam}
				feeds={feeds.data}
				onmove={(by) => moveView(index, by)}
				ondelete={() => deleteView(v.id)}
			/>
		{/each}

		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={addView}
				disabled={draft.views.length >= MAX_VIEWS}><Plus /> Add view</Button
			>
			<Button variant="ghost" size="sm" onclick={resetViews}>
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
					<ul role="status" aria-label="Loading your teams" class="grid gap-1 sm:grid-cols-2">
						{#each TEAM_SKELETON_ROWS as row (row)}
							<li class="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
								<TextSkeleton class="w-2/3" />
								<Skeleton class="h-[18.4px] w-8 rounded-full" />
							</li>
						{/each}
					</ul>
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
					description="For example dependabot, renovate, and GitHub Apps. Hush does not track them. An item that requests your review by name, or that is assigned to you, always shows."
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

		<UnsavedChangesBar draft={editor} {error} />
	{/if}
</div>
