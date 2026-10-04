<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';

	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);
	const smartStatus = $derived(
		me.data?.smartDecisionsPaused
			? 'Smart decisions are paused until 00:00 UTC: your account used its tokens for today. Rules without Jev work as before.'
			: me.data?.smartDecisionsChecking
				? 'Jev is reading your items again… Their categories and tags update when this ends.'
				: ''
	);
</script>

<svelte:head><title>Turns & Jev · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Turns & Jev</h1>
		<p class="text-sm text-muted-foreground">
			What makes an item your turn, and whether Jev reads your pull requests and issues.
		</p>
	</div>

	{#if settings}
		<Card.Root>
			<Card.Content class="divide-y">
				<SettingRow
					id="bots"
					label="Bot activity is not your turn"
					description="Comments and pull requests from dependabot, renovate, codecov, and other bots. A review request to you by name still counts."
				>
					<Switch
						id="bots"
						checked={settings.botsAreFyi}
						onCheckedChange={(v) => saveSettings({ botsAreFyi: v })}
					/>
				</SettingRow>
				<SettingRow
					id="team-reviews"
					label="Team review requests are your turn"
					description="A review request to a team you are in counts as your turn (and can push), not your team's."
				>
					<Switch
						id="team-reviews"
						checked={settings.teamReviewsAreAction}
						onCheckedChange={(v) => saveSettings({ teamReviewsAreAction: v })}
					/>
				</SettingRow>
				<SettingRow
					id="smart-decisions"
					label="Smart decisions"
					description="Jev, a decision model, sorts your PRs and issues into categories and tags, and reads new comments: comments that need nothing from you (thanks, +1) stop being your turn. It sends titles, descriptions, and comments to TypeSafe."
				>
					<Switch
						id="smart-decisions"
						checked={settings.smartDecisions}
						onCheckedChange={(v) => saveSettings({ smartDecisions: v })}
					/>
				</SettingRow>
				{#if settings.smartDecisions && smartStatus}
					<p class="py-2 text-xs text-muted-foreground" role="status">{smartStatus}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
