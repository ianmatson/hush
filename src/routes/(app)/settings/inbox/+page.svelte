<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import type { SavedView } from '$lib/shared/types';
	import { FEED_TABS, VIEW_BASES } from '$lib/shared/views';
	import {
		NEW_COMMITS_AFTER_REVIEW_OPTIONS,
		type NewCommitsAfterReview
	} from '$lib/shared/dashboard';
	import * as Select from '$lib/components/ui/select';
	import SortableList from '$lib/components/app/sortable-list.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import Rss from '@lucide/svelte/icons/rss';
	import FeedButton from '$lib/components/app/feed-button.svelte';

	const me = createQuery(meQuery);
	const feeds = createQuery(feedsQuery);
	const settings = $derived(me.data?.settings);
	const smartStatus = $derived(
		me.data?.smartDecisionsPaused
			? 'Smart decisions are paused until 00:00 UTC: your account used its tokens for today. Your other settings work as before.'
			: me.data?.smartDecisionsChecking
				? 'Checking your open threads… Their lists update when this ends.'
				: ''
	);

	const newCommitsLabel = $derived(
		NEW_COMMITS_AFTER_REVIEW_OPTIONS.find((o) => o.id === settings?.newCommitsAfterReview)?.label
	);

	// Notification views, for reordering here (they are made and edited on the inbox).
	const viewRows = $derived((settings?.views ?? []).map((view) => ({ key: view.id, view })));
	function describeView(v: SavedView) {
		return [VIEW_BASES.find((b) => b.id === v.base)?.label, v.query || null]
			.filter(Boolean)
			.join(', ');
	}
</script>

<svelte:head><title>Inbox · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Inbox</h1>
		<p class="text-sm text-muted-foreground">
			By default, only direct review requests, problems on your own PRs, direct mentions, and
			replies to you are “Needs you”. Everything else is FYI.
		</p>
	</div>

	{#if settings}
		<Card.Root>
			<Card.Header><Card.Title>Defaults</Card.Title></Card.Header>
			<Card.Content class="divide-y">
				<SettingRow
					id="bots"
					label="Bot activity is FYI"
					description="Comments and review requests from dependabot, renovate, codecov, and other bots."
				>
					<SavedSwitch
						id="bots"
						checked={settings.botsAreFyi}
						onsave={(v) => saveSettings({ botsAreFyi: v })}
					/>
				</SettingRow>
				<SettingRow
					id="team-reviews"
					label="Team review requests need me"
					description="A review request to a team you are in goes to “Needs you” (and push), not FYI."
				>
					<SavedSwitch
						id="team-reviews"
						checked={settings.teamReviewsAreAction}
						onsave={(v) => saveSettings({ teamReviewsAreAction: v })}
					/>
				</SettingRow>
				<SettingRow
					label="New commits after my review need me"
					description="New commits on a PR that you reviewed make it your turn again (and push). “Only after I request changes”: after an approval or a comment, the PR waits on others."
				>
					<Select.Root
						type="single"
						value={settings.newCommitsAfterReview}
						onValueChange={(v) =>
							saveSettings({ newCommitsAfterReview: v as NewCommitsAfterReview })}
					>
						<Select.Trigger class="w-64" aria-label="New commits after my review need me"
							>{newCommitsLabel}</Select.Trigger
						>
						<Select.Content>
							{#each NEW_COMMITS_AFTER_REVIEW_OPTIONS as o (o.id)}
								<Select.Item value={o.id} label={o.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</SettingRow>
				<SettingRow
					id="smart-decisions"
					label="Smart decisions"
					description="Jev, a decision model, reads the newest comments, and your about: conditions. Comments that need nothing from you (thanks, +1) stop being your turn. It sends titles, descriptions, and comments to TypeSafe."
				>
					<SavedSwitch
						id="smart-decisions"
						checked={settings.smartDecisions}
						onsave={(v) => saveSettings({ smartDecisions: v })}
					/>
				</SettingRow>
				{#if settings.smartDecisions && smartStatus}
					<p class="py-2 text-xs text-muted-foreground" role="status">{smartStatus}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root id="views">
			<Card.Header>
				<Card.Title>Views and feeds</Card.Title>
				<Card.Description
					>Notification views are extra inbox tabs, in this order. Make one with “+” after the tabs,
					or “Save as view” next to the filter. <Rss class="inline size-3.5" /> makes an Atom feed of
					a tab, for any feed reader.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-3">
				<p class="text-xs font-medium text-muted-foreground">Built-in tabs</p>
				<ul class="-mt-1.5 grid gap-1 rounded-lg border p-1 text-sm" aria-label="Built-in tabs">
					{#each FEED_TABS as t (t.id)}
						<li class="flex items-center gap-2 rounded-md py-0.5 pr-1 pl-2.5 hover:bg-muted/50">
							<span class="min-w-0 flex-1 truncate">{t.label}</span>
							<FeedButton view={t.id} name={t.label} feeds={feeds.data} />
						</li>
					{/each}
				</ul>
				<p class="pt-1 text-xs font-medium text-muted-foreground">Your notification views</p>
				<div class="-mt-1.5 rounded-lg border p-1">
					<SortableList
						items={viewRows}
						onchange={(rows) => saveSettings({ views: rows.map((r) => r.view) }, 'Views saved')}
						label="Notification views in order"
						empty="No notification views yet."
					>
						{#snippet row(r)}
							<span class="min-w-0 flex-1">
								<span class="block truncate">{r.view.name}</span>
								<span class="block truncate text-xs text-muted-foreground"
									>{describeView(r.view)}</span
								>
							</span>
						{/snippet}
						{#snippet actions(r)}
							<FeedButton view="v:{r.view.id}" name={r.view.name} feeds={feeds.data} />
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Edit {r.view.name}"
								href="/inbox?view=v:{r.view.id}&edit=1"><Pencil /></Button
							>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Delete {r.view.name}"
								onclick={() =>
									saveSettings(
										{ views: settings.views.filter((v) => v.id !== r.view.id) },
										`View “${r.view.name}” deleted`
									)}><Trash /></Button
							>
						{/snippet}
					</SortableList>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Categories</Card.Title>
				<Card.Description
					>Each category decides what happens to its threads: Needs you, FYI, or Muted, push, and a
					move to Done or Snoozed. Set this in <a
						class="underline underline-offset-2"
						href="/settings/categories">Categories &amp; tags</a
					>.</Card.Description
				>
			</Card.Header>
		</Card.Root>
	{/if}
</div>
