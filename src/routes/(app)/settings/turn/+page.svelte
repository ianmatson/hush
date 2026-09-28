<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';

	/** What counts as your turn: the few choices that change where items go. */
	const me = createQuery(meQuery);
	const s = $derived(me.data?.settings);
	let stale = $state<number | null>(null);
	$effect(() => {
		if (s && stale === null) stale = s.staleDays;
	});
	function saveStale() {
		if (s && stale && stale !== s.staleDays && stale >= 1 && stale <= 60)
			saveSettings({ staleDays: Math.round(stale) }, 'Saved');
	}
</script>

<svelte:head><title>Your turn · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Your turn</h1>
		<p class="text-sm text-muted-foreground">
			By default, Your turn has only what waits on you by name: your review, a reply to you, your PR
			that needs a fix or is ready to merge. When Hush is wrong about an item, choose “Not my turn”
			on it: that changes these for you.
		</p>
	</div>
	{#if s}
		<Card.Root>
			<Card.Content class="divide-y">
				<SettingRow
					id="teams"
					label="Review requests to my teams are my turn"
					description="Off: they wait on the team, in Waiting."
				>
					<Switch
						id="teams"
						checked={s.teamReviewsAreMine}
						onCheckedChange={(v) => saveSettings({ teamReviewsAreMine: v })}
					/>
				</SettingRow>
				<SettingRow
					id="any-review"
					label="A review by someone else settles a review request"
					description="When someone else approves or asks for changes after the newest push, the request is no longer your turn."
				>
					<Switch
						id="any-review"
						checked={s.reviewResolution === 'any_review'}
						onCheckedChange={(v) => saveSettings({ reviewResolution: v ? 'any_review' : 'strict' })}
					/>
				</SettingRow>
				<SettingRow
					id="bots"
					label="Bots are updates"
					description="PRs and comments by dependabot, renovate, and other bots go to Updates. A review request to you by name still counts."
				>
					<Switch
						id="bots"
						checked={s.botsAreUpdates}
						onCheckedChange={(v) => saveSettings({ botsAreUpdates: v })}
					/>
				</SettingRow>
				<SettingRow
					id="stale"
					label="Stale after"
					description="An item that waited longer than this is marked in amber."
				>
					<span class="flex items-center gap-2 text-sm">
						<Input
							id="stale"
							type="number"
							min="1"
							max="60"
							class="h-8 w-16"
							bind:value={stale}
							onchange={saveStale}
						/>days
					</span>
				</SettingRow>
				<SettingRow
					id="mark-read"
					label="Keep GitHub in step"
					description="When you see an item in Hush, mark its notification read on GitHub; when you choose Done, mark it done there too."
				>
					<Switch
						id="mark-read"
						checked={s.markReadOnGitHub}
						onCheckedChange={(v) => saveSettings({ markReadOnGitHub: v })}
					/>
				</SettingRow>
			</Card.Content>
		</Card.Root>
		<p class="text-xs text-muted-foreground">
			For more control: rules and the GitHub searches Hush runs are in <a
				class="underline underline-offset-2"
				href="/settings/advanced">Advanced</a
			>.
		</p>
	{/if}
</div>
