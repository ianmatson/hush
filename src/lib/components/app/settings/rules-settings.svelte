<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { validateRules } from '$lib/shared/place';
	import type { Lane, Rule } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import RuleCard, { type RulePreview } from '$lib/components/app/rule-card.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	/**
	 * Rules: a query, and what to do with the items it matches. Most people never need one: "Not
	 * my turn" on an item makes the few that matter.
	 */
	const me = createQuery(meQuery);
	const settings = $derived(me.data?.settings);

	const EXAMPLE: Rule[] = [
		{ name: 'Docs repo is updates', when: 'repo:acme/website', then: { lane: 'updates' } },
		{ name: 'Mute dependabot', when: 'author:dependabot*', then: { mute: true } },
		{ name: 'Quiet reviews on drafts', when: 'needs:review is:draft', then: { push: false } },
		{
			name: 'Releases I watch are my turn',
			when: 'type:release repo:sveltejs/*',
			then: { lane: 'turn', push: true }
		},
		{
			name: 'Nightly CI can wait',
			when: 'type:ci repo:acme/nightly',
			then: { snoozeHours: 12, push: false }
		}
	];

	let draft = $state<Rule[]>([]);
	let dirty = $state(false);
	let saving = $state(false);
	$effect(() => {
		const rules = settings?.rules;
		untrack(() => {
			if (rules && !dirty) draft = structuredClone($state.snapshot(rules) as Rule[]);
		});
	});
	/** A rule from an item's menu ("Make a rule…"): /settings/advanced?rule=<query>. */
	$effect(() => {
		const when = page.url.searchParams.get('rule');
		if (when === null || !settings) return;
		untrack(() => {
			draft = [...draft, { name: '', when, then: { lane: 'updates' } }];
			dirty = true;
			goto('/settings/advanced#rules', { replaceState: true, noScroll: true });
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

	// Preview: what the unsaved rules would catch, from the server (your stored items).
	let preview = $state<{ perRule: RulePreview[]; moves: Record<Lane, number> } | null>(null);
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
		const names: [Lane, string][] = [
			['turn', 'Your turn'],
			['waiting', 'Waiting'],
			['updates', 'Updates'],
			['muted', 'Muted']
		];
		const parts = names
			.filter(([k]) => preview!.moves[k])
			.map(([k, l]) => `${preview!.moves[k]} to ${l}`);
		return parts.length
			? `If you save: ${parts.join(', ')}.`
			: 'If you save: no item changes lane.';
	});
</script>

<Card.Root id="rules" class="scroll-mt-20">
	<Card.Header>
		<Card.Title>Rules</Card.Title>
		<Card.Description
			>Hush checks your rules from top to bottom, after its own placement; the first rule that
			matches an item wins. Each is a query: the same words as Search. Tip: right-click an item and
			choose “Make a rule…”.</Card.Description
		>
	</Card.Header>
	<Card.Content class="grid gap-3">
		{#each draft as _, k (k)}
			<RuleCard
				bind:rule={draft[k]}
				index={k}
				count={draft.length}
				preview={preview?.perRule[k]}
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
			<p class="text-sm text-muted-foreground">No rules. Hush places every item by itself.</p>
		{/each}
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => change([...draft, { name: '', when: '', then: { lane: 'updates' } }])}
				><Plus />New rule</Button
			>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm"><Sparkles />From a template</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-60">
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
	<Card.Footer class="border-t">
		<div class="ml-auto flex flex-wrap items-center gap-2">
			{#if moveText}<span class="text-xs text-muted-foreground">{moveText}</span>{/if}
			{#if dirty}<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button>{/if}
			<Button size="sm" disabled={!dirty || !!rulesError || saving} onclick={saveRules}
				>Save rules</Button
			>
		</div>
	</Card.Footer>
</Card.Root>
