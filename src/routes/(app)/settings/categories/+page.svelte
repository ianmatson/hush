<script lang="ts">
	import { describeBuilder, queryToBuilder } from '$lib/shared/rule-builder';
	import { NOTIFICATION_WORDS } from '$lib/shared/query';
	import { tick, untrack, type Snippet } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { categoryFeedView } from '$lib/shared/views';
	import FeedButton from '$lib/components/app/feed-button.svelte';
	import IconPicker from '$lib/components/app/marks/icon-picker.svelte';
	import { saveSettings } from '$lib/save-settings';
	import {
		DEFAULT_CATEGORY_GROUPS,
		MAX_CATEGORIES,
		MAX_CATEGORY_GROUPS,
		MAX_DESCRIPTION_CHARS,
		MAX_MARK_NAME_CHARS,
		validateCategoryGroups
	} from '$lib/shared/categories';
	import type { CategoryGroup, ItemCategory } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import RuleBuilder from '$lib/components/app/rules/rule-builder.svelte';
	import { previewItems, ruleSuggestions } from '$lib/rule-preview';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ReorderList from '$lib/components/app/reorder-list.svelte';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const me = createQuery(meQuery);
	const feeds = createQuery(feedsQuery);
	const MARK_WORDS = ['category'];
	const NO_RULE = 'No rule: only Jev, or your own choice, puts items here.';
	const suggestions = $derived(ruleSuggestions(me.data?.settings));

	const PER_ITEM_OPTIONS = [
		{ id: 'one', label: 'One category per item' },
		{ id: 'multiple', label: 'Any number per item' }
	];

	let groups = $state<CategoryGroup[] | null>(null);
	let saved = $state('');
	$effect(() => {
		const settings = me.data?.settings;
		untrack(() => {
			if (settings && !groups) {
				groups = structuredClone($state.snapshot(settings.categoryGroups));
				saved = JSON.stringify(settings.categoryGroups);
				if (page.url.searchParams.get('new') === 'category')
					addCategory(groups[0] ?? addGroup(), { rule: page.url.searchParams.get('rule') ?? '' });
			}
		});
	});
	const dirty = $derived(!!groups && JSON.stringify(groups) !== saved);
	const error = $derived(groups ? validateCategoryGroups(groups) : null);
	const categoryCount = $derived(groups?.reduce((n, g) => n + g.categories.length, 0) ?? 0);
	let saving = $state(false);
	let reevaluating = $state(false);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Leave without saving your category changes?')) nav.cancel();
	});

	const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

	function addGroup(): CategoryGroup {
		const fresh: CategoryGroup = {
			id: newId('group'),
			name: 'New group',
			multiple: false,
			categories: []
		};
		groups = [...(groups ?? []), fresh];
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-group="${fresh.id}"]`)?.focus()
		);
		return groups[groups.length - 1];
	}

	function moveGroup(index: number, by: number) {
		if (!groups) return;
		const list = [...groups];
		const [g] = list.splice(index, 1);
		list.splice(index + by, 0, g);
		groups = list;
	}

	function addCategory(g: CategoryGroup, start: Partial<ItemCategory> = {}) {
		const fresh: ItemCategory = {
			id: newId('category'),
			name: 'New category',
			color: 'blue',
			rule: '',
			description: '',
			...start
		};
		g.categories = [...g.categories, fresh];
		openCategory = fresh.id;
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-category="${fresh.id}"]`)?.focus()
		);
	}

	let openCategory = $state<string | null>(null);
	const DRAWER = { duration: 180, easing: cubicOut };

	function ruleWords(rule: string): string {
		const builder = queryToBuilder(rule);
		return builder ? describeBuilder(builder).replace(/\.$/, '') : rule.trim();
	}

	function categorySummary(c: ItemCategory): string {
		const parts = [
			c.rule.trim() && ruleWords(c.rule),
			c.description.trim() && `Jev: ${c.description.trim()}`
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : 'No rule or description yet';
	}

	function groupHelp(g: CategoryGroup): string {
		return g.multiple
			? 'Each category is checked on its own: an item gets every category whose rule matches, or whose description Jev says fits.'
			: 'The first rule that matches wins, so drag specific categories above broad ones. With no match, Jev picks one that has a description. When Jev is off or unavailable, the item has no category from this group.';
	}

	function setIcon(c: ItemCategory, icon: string | undefined) {
		if (icon) c.icon = icon;
		else delete c.icon;
	}

	async function save() {
		if (!groups || error) return;
		saving = true;
		if (await saveSettings({ categoryGroups: $state.snapshot(groups) }, 'Categories saved'))
			saved = JSON.stringify(groups);
		saving = false;
	}

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

{#snippet categoryHeader(c: ItemCategory, handle: Snippet | null)}
	{@const expanded = openCategory === c.id}
	<div class="flex items-center gap-1.5 p-1.5">
		{#if handle}
			{@render handle()}
		{:else}
			<span class="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60"
				><GripVertical class="size-4" /></span
			>
		{/if}
		<IconPicker
			icon={c.icon}
			color={c.color}
			label={c.name}
			onpick={(icon) => setIcon(c, icon)}
			oncolor={(color) => (c.color = color)}
		/>
		<button
			type="button"
			class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
			aria-expanded={expanded}
			aria-controls="category-{c.id}-details"
			onclick={() => (openCategory = expanded ? null : c.id)}
		>
			<span class="block truncate text-sm font-medium">{c.name || 'Untitled'}</span>
			<span class="block truncate text-xs text-muted-foreground">{categorySummary(c)}</span>
		</button>
		<FeedButton view={categoryFeedView(c.id)} name={c.name} feeds={feeds.data} />
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={expanded ? `Close ${c.name}` : `Edit ${c.name}`}
			onclick={() => (openCategory = expanded ? null : c.id)}
			><ChevronDown class={cn('transition-transform', expanded && 'rotate-180')} /></Button
		>
	</div>
{/snippet}

{#snippet categoryCard(g: CategoryGroup, c: ItemCategory, handle: Snippet | null)}
	{@const expanded = openCategory === c.id}
	{@render categoryHeader(c, handle)}
	<div data-no-drag>
		{#if expanded}
			<div
				id="category-{c.id}-details"
				class="grid grid-cols-[minmax(0,1fr)] gap-2 border-t p-2.5"
				transition:slide={DRAWER}
			>
				<div class="flex items-center gap-2">
					<Input
						bind:value={c.name}
						data-name
						data-category={c.id}
						aria-label="Category name"
						maxlength={MAX_MARK_NAME_CHARS}
						class="h-8 min-w-0 flex-1"
					/>
					<Button
						variant="ghost"
						size="sm"
						class="text-destructive"
						onclick={() => (g.categories = g.categories.filter((x) => x.id !== c.id))}
						><Trash /> Delete</Button
					>
				</div>
				<RuleBuilder
					bind:value={c.rule}
					id="category-{c.id}-rule"
					label="Rule (optional)"
					exclude={[...MARK_WORDS, ...NOTIFICATION_WORDS]}
					emptyText={NO_RULE}
					{suggestions}
					preview={(q) => (me.data ? previewItems(q, me.data.login, me.data.settings) : null)}
				/>
				<div class="grid gap-1">
					<label for="category-{c.id}-description" class="text-xs font-medium text-muted-foreground"
						>Description for Jev (optional)</label
					>
					<Input
						id="category-{c.id}-description"
						bind:value={c.description}
						maxlength={MAX_DESCRIPTION_CHARS}
						class="h-8 text-xs"
						placeholder="What belongs here, in a few words"
					/>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

<div class="grid gap-6">
	<div>
		<h1 class="hidden text-lg font-semibold tracking-tight md:block">Categories</h1>
		<p class="text-sm text-muted-foreground">
			Sort your PRs and issues into groups of categories. A group gives each item one category, or
			any number of them. Rules use the
			<a class="underline" href="/docs/query-language" target="_blank" rel="noreferrer"
				>query language</a
			>; a description lets Jev decide.
		</p>
	</div>

	{#if groups}
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
							onclick={() => groups && (groups = groups.filter((x) => x.id !== g.id))}
							><Trash /></Button
						>
					</Card.Action>
					<Card.Description class="col-span-2 grid gap-2">
						<Select.Root
							type="single"
							value={g.multiple ? 'multiple' : 'one'}
							onValueChange={(v) => (g.multiple = v === 'multiple')}
						>
							<Select.Trigger size="sm" class="w-full sm:w-56" aria-label="{g.name}: per item"
								>{PER_ITEM_OPTIONS.find((o) => o.id === (g.multiple ? 'multiple' : 'one'))
									?.label}</Select.Trigger
							>
							<Select.Content>
								{#each PER_ITEM_OPTIONS as o (o.id)}
									<Select.Item value={o.id} label={o.label} />
								{/each}
							</Select.Content>
						</Select.Root>
						<span>{groupHelp(g)}</span>
					</Card.Description>
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
						{#snippet row(c, _index, handle)}
							{@render categoryCard(g, c, handle)}
						{/snippet}
						{#snippet ghost(c)}
							{@render categoryHeader(c, null)}
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
				onclick={() => (groups = structuredClone(DEFAULT_CATEGORY_GROUPS))}
			>
				<RotateCcw /> Defaults
			</Button>
		</div>

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
					disabled={reevaluating || dirty || !categoryCount}
				>
					<RefreshCw class={reevaluating ? 'animate-spin' : ''} /> Re-evaluate items
				</Button>
				{#if dirty}
					<p class="mt-2 text-xs text-muted-foreground">Save your changes first.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<div
			class="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/90 p-3 shadow-sm backdrop-blur"
			class:hidden={!dirty}
		>
			{#if error}<p class="mr-auto text-xs text-destructive">{error}</p>{:else}<p
					class="mr-auto text-xs text-muted-foreground"
				>
					You have unsaved changes.
				</p>{/if}
			<Button variant="ghost" size="sm" onclick={() => (groups = JSON.parse(saved))}>Discard</Button
			>
			<Button size="sm" onclick={save} disabled={!!error || saving}>Save</Button>
		</div>
	{/if}
</div>
