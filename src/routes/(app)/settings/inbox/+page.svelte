<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { FEED_TABS } from '$lib/shared/views';
	import {
		NEW_COMMITS_AFTER_REVIEW_OPTIONS,
		type NewCommitsAfterReview
	} from '$lib/shared/dashboard';
	import * as Select from '$lib/components/ui/select';
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

		<Card.Root id="feeds">
			<Card.Header>
				<Card.Title>Feeds</Card.Title>
				<Card.Description
					><Rss class="inline size-3.5" /> makes an Atom feed of an inbox tab, for any feed reader. Each
					view has a feed too, in Settings → Views.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<ul class="grid gap-1 rounded-lg border p-1 text-sm" aria-label="Inbox tabs">
					{#each FEED_TABS as t (t.id)}
						<li class="flex items-center gap-2 rounded-md py-0.5 pr-1 pl-2.5 hover:bg-muted/50">
							<span class="min-w-0 flex-1 truncate">{t.label}</span>
							<FeedButton view={t.id} name={t.label} feeds={feeds.data} />
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
