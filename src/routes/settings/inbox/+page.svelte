<script lang="ts">
	import { untrack } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { validateRules } from '$lib/shared/classify';
	import type { Rule } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';

	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);

	const EXAMPLE: Rule[] = [
		{ name: 'Docs repo is FYI', when: { repo: 'PostHog/posthog.com' }, then: { category: 'fyi' } },
		{ name: 'Mute dependabot', when: { author: 'dependabot*' }, then: { category: 'muted' } },
		{
			name: 'Quiet reviews on drafts',
			when: { kind: ['review'], draft: true },
			then: { push: false }
		},
		{
			name: 'Releases I watch need me',
			when: { type: ['Release'], repo: 'sveltejs/*' },
			then: { category: 'action', push: true }
		}
	];

	let rulesText = $state('');
	let dirty = $state(false);
	// Fill the editor once the settings arrive (from the cache, usually at once).
	$effect(() => {
		const rules = settings?.rules;
		untrack(() => {
			if (rules && !dirty) rulesText = JSON.stringify(rules, null, 2);
		});
	});

	const rulesError = $derived.by(() => {
		if (!dirty) return null;
		try {
			return validateRules(JSON.parse(rulesText));
		} catch (err) {
			return `Invalid JSON: ${(err as Error).message}`;
		}
	});

	async function saveRules() {
		if (rulesError) return;
		if (await saveSettings({ rules: JSON.parse(rulesText) }, 'Rules saved')) dirty = false;
	}
</script>

<svelte:head><title>Inbox · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Inbox</h1>
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
					<Switch
						id="bots"
						checked={settings.botsAreFyi}
						onCheckedChange={(v) => saveSettings({ botsAreFyi: v })}
					/>
				</SettingRow>
				<SettingRow
					id="team-reviews"
					label="Team review requests need me"
					description="A review request to a team you are in goes to “Needs you” (and push), not FYI."
				>
					<Switch
						id="team-reviews"
						checked={settings.teamReviewsAreAction}
						onCheckedChange={(v) => saveSettings({ teamReviewsAreAction: v })}
					/>
				</SettingRow>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Rules</Card.Title>
				<Card.Description
					>JSON. Hush checks rules from top to bottom after the defaults. The first rule that
					matches wins.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid gap-2">
				<div class="flex justify-between gap-2">
					<Label for="rules">Rules</Label>
					<Button
						variant="ghost"
						size="xs"
						onclick={() => {
							rulesText = JSON.stringify(EXAMPLE, null, 2);
							dirty = true;
						}}>Insert examples</Button
					>
				</div>
				<Textarea
					id="rules"
					class="min-h-56 font-mono text-xs"
					spellcheck={false}
					bind:value={rulesText}
					oninput={() => (dirty = true)}
				/>
				{#if rulesError}<p class="text-xs text-destructive">{rulesError}</p>{/if}
				<details class="text-xs text-muted-foreground">
					<summary class="cursor-pointer select-none">Rule reference</summary>
					<div class="mt-2 grid gap-1 leading-relaxed">
						<p><code>when</code> (all conditions must match):</p>
						<ul class="ml-4 list-disc">
							<li>
								<code>repo</code>, <code>author</code>: glob or list of globs, e.g.
								<code>"PostHog/*"</code>
							</li>
							<li>
								<code>reason</code>: <code>mention</code>, <code>review_requested</code>,
								<code>team_mention</code>,
								<code>comment</code>, <code>author</code>, <code>assign</code>,
								<code>subscribed</code>,
								<code>ci_activity</code>, <code>state_change</code>…
							</li>
							<li>
								<code>type</code>: <code>PullRequest</code>, <code>Issue</code>,
								<code>Release</code>, <code>Discussion</code>, <code>CheckSuite</code>,
								<code>Commit</code>
							</li>
							<li>
								<code>kind</code>: <code>review</code>, <code>fix_ci</code>,
								<code>address_review</code>,
								<code>resolve_conflict</code>, <code>merge</code>, <code>reply</code>,
								<code>triage</code>,
								<code>security</code>, <code>none</code>
							</li>
							<li>
								<code>category</code> (the default result): <code>action</code>, <code>fyi</code>
							</li>
							<li>
								<code>label</code>: list of label names · <code>titleContains</code>: text ·
								<code>bot</code>, <code>draft</code>: true or false
							</li>
						</ul>
						<p>
							<code>then</code>: <code>category</code> (<code>action</code>, <code>fyi</code>,
							<code>muted</code>) and/or
							<code>push</code> (true or false). Add <code>"enabled": false</code> to turn a rule off.
						</p>
					</div>
				</details>
				<div class="flex justify-end">
					<Button size="sm" disabled={!dirty || !!rulesError} onclick={saveRules}>Save rules</Button
					>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
