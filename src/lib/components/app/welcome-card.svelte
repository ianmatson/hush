<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, meQuery, queryClient } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { enablePush, pushSupport } from '$lib/push';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { MeDTO, Rule } from '$lib/shared/types';

	/**
	 * The first run: what Hush found (the "noise report"), and three one-tap questions. Answered or
	 * skipped once per account.
	 */
	const me = createQuery(meQuery);
	const summary = createQuery(() => ({
		queryKey: ['summary'],
		queryFn: api.summary,
		refetchInterval: 5_000
	}));
	const s = $derived(summary.data);

	let teams = $state(false);
	let quiet = $state<string[]>([]);
	let pushing = $state(false);
	let pushOn = $state(false);
	const canPush = $derived(pushSupport() === 'supported');

	async function turnOnPush() {
		pushing = true;
		try {
			await enablePush();
			pushOn = true;
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			pushing = false;
		}
	}

	async function finish(save: boolean) {
		const settings = me.data?.settings;
		if (save && settings) {
			const rules: Rule[] = [
				...quiet.map((repo) => ({
					name: `${repo} is updates`,
					when: `repo:${repo}`,
					then: { lane: 'updates' as const }
				})),
				...settings.rules
			];
			await saveSettings(
				{ teamReviewsAreMine: teams, ...(quiet.length ? { rules } : {}) },
				'Saved'
			);
		}
		await api.onboarded();
		queryClient.setQueryData<MeDTO>(keys.me, (old) => (old ? { ...old, onboarded: true } : old));
	}
</script>

<section class="mb-6 rounded-2xl border bg-card p-5 shadow-xs">
	<h2 class="text-base font-semibold tracking-tight">Welcome to Hush</h2>
	{#if s}
		<p class="mt-1 text-sm text-muted-foreground">
			Hush found <b class="text-foreground">{s.counts.turn}</b>
			{s.counts.turn === 1 ? 'thing' : 'things'} waiting on you and
			<b class="text-foreground">{s.counts.waiting}</b> waiting on others, and moved
			<b class="text-foreground">{s.updates}</b>
			{s.updates === 1 ? 'item' : 'items'} to Updates{#if s.notifications}, from
				{s.notifications} notifications{/if}. It keeps looking every few minutes.
		</p>
	{:else}
		<p class="mt-1 text-sm text-muted-foreground">Hush is reading your GitHub notifications…</p>
	{/if}

	<div class="mt-4 grid gap-4 text-sm">
		<label class="flex items-start gap-3">
			<Switch bind:checked={teams} class="mt-0.5" />
			<span>
				<span class="font-medium">Review requests to my teams are my turn</span>
				<span class="block text-xs text-muted-foreground"
					>Off: they wait on the team, in Waiting. Most people with big teams leave this off.</span
				>
			</span>
		</label>

		{#if s?.noisyRepos.length}
			<div>
				<p class="font-medium">Repositories you only want to read about</p>
				<p class="text-xs text-muted-foreground">
					Everything from the ones you check goes to Updates, even when it asks for you.
				</p>
				<div class="mt-2 grid gap-1.5 sm:grid-cols-2">
					{#each s.noisyRepos as r (r.repo)}
						<label class="flex items-center gap-2 text-[0.8rem]">
							<Checkbox
								checked={quiet.includes(r.repo)}
								onCheckedChange={(v) =>
									(quiet = v ? [...quiet, r.repo] : quiet.filter((x) => x !== r.repo))}
							/>
							<span class="truncate font-mono">{r.repo}</span>
							<span class="text-muted-foreground tabular-nums">{r.count}</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		{#if canPush}
			<div class="flex items-center gap-3">
				<Button variant="outline" size="sm" onclick={turnOnPush} disabled={pushing || pushOn}
					>{pushOn ? 'Push is on' : 'Push to this device'}</Button
				>
				<span class="text-xs text-muted-foreground">Only when something becomes your turn.</span>
			</div>
		{/if}
	</div>

	<div class="mt-5 flex gap-2">
		<Button size="sm" onclick={() => finish(true)}>Done</Button>
		<Button variant="ghost" size="sm" onclick={() => finish(false)}>Skip</Button>
	</div>
</section>
