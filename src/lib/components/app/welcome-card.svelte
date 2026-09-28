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
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/**
	 * The first run: what Hush found (the "noise report"), and three one-tap questions. Answered or
	 * skipped once per account.
	 */
	const me = createQuery(meQuery);
	const syncing = $derived(!!me.data?.firstSync);
	// While the first sync runs, the counts grow: ask again every few seconds.
	const summary = createQuery(() => ({
		queryKey: ['summary'],
		queryFn: api.summary,
		refetchInterval: syncing ? 3_000 : false
	}));
	const s = $derived(summary.data);
	// The last read of a first sync can be a few seconds old: read once more when it ends.
	let wasSyncing = false;
	$effect(() => {
		if (wasSyncing && !syncing) void summary.refetch();
		wasSyncing = syncing;
	});
	const found = $derived(s ? s.counts.action + s.counts.fyi : 0);

	// Your answer, or the setting until you answer (the settings refresh while the sync runs).
	let teamsChoice = $state<boolean | null>(null);
	const teams = $derived(teamsChoice ?? me.data?.settings.teamReviewsAreAction ?? false);
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
					name: `${repo} is FYI`,
					when: `repo:${repo}`,
					then: { category: 'fyi' as const }
				})),
				...settings.rules
			];
			await saveSettings(
				{ teamReviewsAreAction: teams, ...(quiet.length ? { rules } : {}) },
				'Saved'
			);
		}
		await api.onboarded();
		queryClient.setQueryData<MeDTO>(keys.me, (old) => (old ? { ...old, onboarded: true } : old));
	}
</script>

<section class="mb-4 rounded-2xl border bg-card p-5 shadow-xs">
	<h2 class="text-base font-semibold tracking-tight">Welcome to Hush</h2>
	{#if syncing || !s}
		<p class="mt-1 flex items-start gap-2 text-sm text-muted-foreground" role="status">
			<LoaderCircle class="mt-0.5 size-4 shrink-0 animate-spin" />
			<span>
				Hush is reading your notifications from the last 14 days. This can take a minute.{#if s && found}{' '}So
					far: <b class="text-foreground">{s.counts.action}</b> need you,
					<b class="text-foreground">{s.counts.fyi}</b> FYI.{/if}
			</span>
		</p>
	{:else}
		<p class="mt-1 text-sm text-muted-foreground">
			From {s.notifications} notifications, Hush found
			<b class="text-foreground">{s.counts.action}</b>
			{s.counts.action === 1 ? 'thing that needs' : 'things that need'} you. It moved
			<b class="text-foreground">{s.counts.fyi}</b> to FYI{#if s.done}, and
				<b class="text-foreground">{s.done}</b> that {s.done === 1 ? 'is' : 'are'} already finished (merged,
				closed, or resolved) to Done{/if}. It keeps looking every few minutes.
		</p>
	{/if}

	<div class="mt-4 grid gap-4 text-sm">
		<label class="flex items-start gap-3">
			<Switch checked={teams} onCheckedChange={(v) => (teamsChoice = v)} class="mt-0.5" />
			<span>
				<span class="font-medium">Review requests to my teams need me</span>
				<span class="block text-xs text-muted-foreground"
					>Off: they are FYI, and show under “Your team's turn” on the Pull requests tab. Most
					people with big teams leave this off.</span
				>
			</span>
		</label>

		{#if !syncing && s?.noisyRepos.length}
			<div>
				<p class="font-medium">Repositories you only want to read about</p>
				<p class="text-xs text-muted-foreground">
					Everything from the ones you check goes to FYI, even when it asks for you.
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
				<span class="text-xs text-muted-foreground">Only what needs you.</span>
			</div>
		{/if}
	</div>

	<div class="mt-5 flex gap-2">
		<Button size="sm" onclick={() => finish(true)}>Done</Button>
		<Button variant="ghost" size="sm" onclick={() => finish(false)}>Skip</Button>
	</div>
</section>
