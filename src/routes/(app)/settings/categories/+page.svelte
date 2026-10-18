<script lang="ts">
	import { tick } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { saveSettings } from '$lib/save-settings';
	import { createSettingsDraft } from '$lib/settings-draft.svelte';
	import { newCategory, newCategoryGroup } from '$lib/category-drafts';
	import { moveItem } from '$lib/draft-edits';
	import SavedSwitch from '$lib/components/app/settings/saved-switch.svelte';
	import SettingRow from '$lib/components/app/setting-row.svelte';
	import CategoryCard from '$lib/components/app/settings/category-card.svelte';
	import UnsavedChangesBar from '$lib/components/app/settings/unsaved-changes-bar.svelte';
	import {
		DEFAULT_CATEGORY_GROUPS,
		MAX_CATEGORIES,
		MAX_CATEGORY_GROUPS,
		MAX_MARK_NAME_CHARS,
		validateCategoryGroups
	} from '$lib/shared/categories';
	import { validateAboutConditions } from '$lib/shared/settings-schema';
	import type { CategoryGroup } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import ReorderList from '$lib/components/app/reorder-list.svelte';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';

	const me = createQuery(meQuery);
	const smartStatus = $derived(
		me.data?.smartDecisionsPaused
			? 'Smart decisions are paused until 00:00 UTC: your account used its tokens for today.'
			: me.data?.smartDecisionsChecking
				? 'Checking your open pull requests and issues… Their categories update when this ends.'
				: ''
	);
	const feeds = createQuery(feedsQuery);

	const editor = createSettingsDraft<CategoryGroup[]>({
		saved: () => me.data?.settings.categoryGroups,
		save: (categoryGroups) => saveSettings({ categoryGroups }, 'Categories saved')
	});
	const savedCategoryIds = $derived(
		new Set((me.data?.settings.categoryGroups ?? []).flatMap((g) => g.categories.map((c) => c.id)))
	);
	const error = $derived(
		editor.draft
			? (validateCategoryGroups(editor.draft) ??
					validateAboutConditions({ categoryGroups: editor.draft }))
			: null
	);
	const categoryCount = $derived(editor.draft?.reduce((n, g) => n + g.categories.length, 0) ?? 0);
	let reevaluating = $state(false);
	let openCategory = $state<string | null>(null);

	function addGroup() {
		const groups = editor.draft;
		if (!groups) return;
		const fresh = newCategoryGroup(groups);
		editor.draft = [...groups, fresh];
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-group="${fresh.id}"]`)?.focus()
		);
	}

	function moveGroup(index: number, by: number) {
		if (editor.draft) editor.draft = moveItem(editor.draft, index, by);
	}

	function deleteGroup(id: string) {
		if (editor.draft) editor.draft = editor.draft.filter((x) => x.id !== id);
	}

	function addCategory(g: CategoryGroup) {
		const fresh = newCategory(g);
		g.categories = [...g.categories, fresh];
		openCategory = fresh.id;
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-category="${fresh.id}"]`)?.focus()
		);
	}

	const toggleCategory = (id: string) => (openCategory = openCategory === id ? null : id);

	async function reevaluate() {
		reevaluating = true;
		try {
			const { items } = await api.reevaluateItems();
			toast.success(
				`Hush asks Jev again about ${items} ${items === 1 ? 'item' : 'items'}. Lists update when it is done.`
			);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			reevaluating = false;
		}
	}
</script>

<svelte:head><title>Categories · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Categories</h1>
		<p class="text-sm text-muted-foreground">
			Sort your PRs and issues into groups. Each item gets one category from each group: the first
			one whose rule matches, top to bottom, or else the one that Jev picks from the descriptions.
			Jev picks only when a group has two or more categories with a description. If neither works,
			the item is “Not sorted” in that group. Rules use the
			<a class="underline" href="/docs/query-language" target="_blank" rel="noreferrer"
				>query language</a
			>.
		</p>
	</div>

	{#if editor.draft}
		{@const groups = editor.draft}
		{#each groups as g, index (g.id)}
			<Card.Root id="group-{g.id}">
				<Card.Header>
					<Card.Title class="flex items-center gap-2">
						<Input
							bind:value={g.name}
							data-group={g.id}
							aria-label="Group name"
							maxlength={MAX_MARK_NAME_CHARS}
							class="h-8 max-w-60 font-semibold"
						/>
					</Card.Title>
					<Card.Action class="row-span-1 flex items-center gap-0.5">
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Move {g.name} up"
							disabled={index === 0}
							onclick={() => moveGroup(index, -1)}><ArrowUp /></Button
						>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Move {g.name} down"
							disabled={index === groups.length - 1}
							onclick={() => moveGroup(index, 1)}><ArrowDown /></Button
						>
						<Button
							variant="ghost"
							size="icon-xs"
							class="text-destructive"
							aria-label="Delete {g.name}"
							onclick={() => deleteGroup(g.id)}><Trash /></Button
						>
					</Card.Action>
				</Card.Header>
				<Card.Content class="grid grid-cols-[minmax(0,1fr)] gap-3">
					<ReorderList
						items={g.categories}
						key={(c) => c.id}
						label="{g.name}, in order"
						class="gap-1.5"
						rowClass={(c) =>
							cn('rounded-lg border bg-card', openCategory === c.id && 'bg-muted/30')}
						onchange={(ordered) => (g.categories = ordered)}
					>
						{#snippet row(c, categoryIndex, handle)}
							<CategoryCard
								bind:category={g.categories[categoryIndex]}
								{handle}
								expanded={openCategory === c.id}
								hasFeed={savedCategoryIds.has(c.id)}
								feeds={feeds.data}
								ontoggle={() => toggleCategory(c.id)}
								ondelete={() => (g.categories = g.categories.filter((x) => x.id !== c.id))}
							/>
						{/snippet}
						{#snippet ghost(c)}
							<CategoryCard
								category={c}
								handle={null}
								expanded={openCategory === c.id}
								hasFeed={savedCategoryIds.has(c.id)}
								feeds={feeds.data}
								headerOnly
								ontoggle={() => {}}
								ondelete={() => {}}
							/>
						{/snippet}
					</ReorderList>
					<div>
						<Button
							variant="outline"
							size="sm"
							onclick={() => addCategory(g)}
							disabled={g.categories.length >= MAX_CATEGORIES}><Plus /> Add category</Button
						>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}

		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={addGroup}
				disabled={groups.length >= MAX_CATEGORY_GROUPS}><Plus /> Add category group</Button
			>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => (editor.draft = structuredClone(DEFAULT_CATEGORY_GROUPS))}
			>
				<RotateCcw /> Defaults
			</Button>
		</div>

		<Card.Root id="smart-decisions">
			<Card.Content>
				<SettingRow
					id="smart-decisions-switch"
					label="Smart decisions"
					description="Jev, a decision model, picks categories from their descriptions, checks your about: conditions, and reads the newest comments: comments that need nothing from you (thanks, +1) stop being your turn. It sends titles, descriptions, and comments to TypeSafe."
				>
					{#if me.data}
						<SavedSwitch
							id="smart-decisions-switch"
							checked={me.data.settings.smartDecisions}
							onsave={(v) => saveSettings({ smartDecisions: v })}
						/>
					{/if}
				</SettingRow>
				{#if me.data?.settings.smartDecisions && smartStatus}
					<p class="py-2 text-xs text-muted-foreground" role="status">{smartStatus}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Re-evaluate items</Card.Title>
				<Card.Description>
					Jev reads each item when Hush first sees it, again when its title, description, or labels
					change, and when you add or change a description. To ask again about every category of the
					items you have now, re-evaluate. Rules without Jev apply at once.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button
					variant="outline"
					size="sm"
					onclick={reevaluate}
					disabled={reevaluating || editor.dirty || !categoryCount}
				>
					<RefreshCw class={reevaluating ? 'animate-spin' : ''} /> Re-evaluate items
				</Button>
				{#if editor.dirty}
					<p class="mt-2 text-xs text-muted-foreground">Save your changes first.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<UnsavedChangesBar draft={editor} {error} />
	{/if}
</div>
