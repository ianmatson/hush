<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { feedsQuery, keys, meQuery, queryClient } from '$lib/queries';
	import { api } from '$lib/api';
	import { saveSettings } from '$lib/save-settings';
	import { validateRules } from '$lib/shared/classify';
	import type { Rule, SavedView, ThreadDTO } from '$lib/shared/types';
	import { FEED_TABS, VIEW_BASES } from '$lib/shared/views';
	import { formatQuery } from '$lib/shared/query';
	import SortableList from '$lib/components/app/sortable-list.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Card from '$lib/components/ui/card';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import RuleCard, { type RulePreview } from '$lib/components/app/rule-card.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Rss from '@lucide/svelte/icons/rss';
	import FeedButton from '$lib/components/app/feed-button.svelte';

	const me = createQuery(meQuery);
	const feeds = createQuery(feedsQuery);
	const settings = $derived(me.data?.settings);

	const EXAMPLE: Rule[] = [
		{ name: 'Docs repo is FYI', when: 'repo:acme/website', then: { category: 'fyi' } },
		{ name: 'Mute dependabot', when: 'author:dependabot*', then: { category: 'muted' } },
		{ name: 'Quiet reviews on drafts', when: 'needs:review is:draft', then: { push: false } },
		{
			name: 'Releases I watch need me',
			when: 'type:release repo:sveltejs/*',
			then: { category: 'action', push: true }
		}
	];

	// --- Rules: a visual editor (the JSON is in settings.json) -------------------------------
	let draft = $state<Rule[]>([]);
	let dirty = $state(false);
	let saving = $state(false);
	// Fill the editor once the settings arrive (from the cache, usually at once), and after saves.
	$effect(() => {
		const rules = settings?.rules;
		untrack(() => {
			if (rules && !dirty) draft = structuredClone($state.snapshot(rules) as Rule[]);
		});
	});

	/** A rule from a thread's right-click menu ("Make a rule…"): /settings/inbox?rule=<query>. */
	$effect(() => {
		const when = page.url.searchParams.get('rule');
		if (when === null || !settings) return;
		untrack(() => {
			draft = [...draft, { name: '', when, then: { category: 'fyi' } }];
			dirty = true;
			goto('/settings/inbox', { replaceState: true, noScroll: true });
			tick().then(() =>
				document
					.querySelector('[aria-label^="Rule "]:last-of-type')
					?.scrollIntoView({ block: 'center' })
			);
		});
	});

	const rulesError = $derived(validateRules(draft));

	function change(next: Rule[]) {
		draft = next;
		dirty = true;
	}
	function moveRule(from: number, to: number) {
		if (to < 0 || to >= draft.length) return;
		const next = [...draft];
		const [r] = next.splice(from, 1);
		next.splice(to, 0, r);
		change(next);
	}
	async function saveRules() {
		if (rulesError) return;
		saving = true;
		if (await saveSettings({ rules: draft }, 'Rules saved')) dirty = false;
		saving = false;
	}
	function cancel() {
		dirty = false;
		if (settings) draft = structuredClone($state.snapshot(settings.rules) as Rule[]);
	}

	// Preview: what the unsaved rules would catch, from the server (your stored threads).
	let preview = $state<{
		perRule: RulePreview[];
		moves: { action: number; fyi: number; muted: number; done: number; snoozed: number };
	} | null>(null);
	$effect(() => {
		const rules = $state.snapshot(draft);
		if (validateRules(rules)) return;
		const t = setTimeout(async () => {
			try {
				preview = await api.previewRules(rules as Rule[]);
			} catch {
				preview = null;
			}
		}, 400);
		return () => clearTimeout(t);
	});
	const moveText = $derived.by(() => {
		if (!dirty || !preview) return null;
		const parts = (
			[
				['action', 'Needs you'],
				['fyi', 'FYI'],
				['muted', 'Muted'],
				['done', 'Done'],
				['snoozed', 'Snoozed']
			] as const
		)
			.filter(([k]) => preview!.moves[k])
			.map(([k, label]) => `${preview!.moves[k]} to ${label}`);
		return parts.length
			? `If you save: ${parts.join(', ')}.`
			: 'If you save: no thread changes place.';
	});

	// Saved views, for reordering here (they are made and edited on the inbox).
	const viewRows = $derived((settings?.views ?? []).map((view) => ({ key: view.id, view })));
	function describeView(v: SavedView) {
		return [VIEW_BASES.find((b) => b.id === v.base)?.label, v.query || null]
			.filter(Boolean)
			.join(', ');
	}

	// Suggestions for repository and author conditions: what your notifications come from.
	const suggest = $derived.by(() => {
		const threads = queryClient
			.getQueriesData<{ threads: ThreadDTO[] }>({ queryKey: keys.threadsAll })
			.flatMap(([, d]) => d?.threads ?? []);
		const uniq = (xs: (string | null | undefined)[]) =>
			[...new Set(xs.filter((x): x is string => !!x))].sort();
		const repos = uniq(threads.map((t) => t.repo));
		return {
			repo: [...uniq(repos.map((r) => `${r.split('/')[0]}/*`)), ...repos],
			author: uniq(threads.map((t) => t.author))
		};
	});
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

		<Card.Root id="views">
			<Card.Header>
				<Card.Title>Views and feeds</Card.Title>
				<Card.Description
					>Saved views are extra inbox tabs, in this order. Make one with “+” after the tabs, or
					“Save as view” next to the filter. <Rss class="inline size-3.5" /> makes an Atom feed of a tab,
					for any feed reader.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-3">
				<ul class="grid gap-1 rounded-lg border p-1 text-sm" aria-label="Built-in tabs">
					{#each FEED_TABS as t (t.id)}
						<li class="flex items-center gap-2 rounded-md py-0.5 pr-1 pl-2.5 hover:bg-muted/50">
							<span class="min-w-0 flex-1 truncate">{t.label}</span>
							<FeedButton view={t.id} name={t.label} feeds={feeds.data} />
						</li>
					{/each}
				</ul>
				<SortableList
					items={viewRows}
					onchange={(rows) => saveSettings({ views: rows.map((r) => r.view) }, 'Views saved')}
					label="Saved views in order"
					empty="No saved views yet."
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
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Rules</Card.Title>
				<Card.Description
					>Hush checks your rules from top to bottom, after its defaults. The first rule that
					matches a thread wins. Tip: right-click a thread and choose “Make a rule…”.</Card.Description
				>
			</Card.Header>
			<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-3">
				{#each draft as _, k (k)}
					<RuleCard
						bind:rule={draft[k]}
						index={k}
						count={draft.length}
						preview={preview?.perRule[k]}
						{suggest}
						onmove={(to) => moveRule(k, to)}
						onduplicate={() =>
							change([
								...draft.slice(0, k + 1),
								structuredClone($state.snapshot(draft[k]) as Rule),
								...draft.slice(k + 1)
							])}
						onremove={() => change(draft.filter((_, i) => i !== k))}
					/>
				{:else}
					<p class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
						No rules yet. Hush uses its defaults for every thread.
					</p>
				{/each}
				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={() => change([...draft, { name: '', when: '', then: { category: 'fyi' } }])}
						><Plus />New rule</Button
					>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="outline" size="sm"><Sparkles />From a template</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-64">
							{#each EXAMPLE as ex (ex.name)}
								<DropdownMenu.Item onclick={() => change([...draft, structuredClone(ex)])}
									>{ex.name}</DropdownMenu.Item
								>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
				{#if rulesError && dirty}<p class="text-xs text-destructive">{rulesError}</p>{/if}
			</Card.Content>
			<Card.Footer class="flex flex-wrap items-center justify-end gap-2 border-t">
				<div class="flex flex-wrap items-center gap-2">
					{#if moveText}<span class="text-xs text-muted-foreground">{moveText}</span>{/if}
					{#if dirty}<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button>{/if}
					<Button size="sm" disabled={!dirty || !!rulesError || saving} onclick={saveRules}
						>Save rules</Button
					>
				</div>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
