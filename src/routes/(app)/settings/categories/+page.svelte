<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { markFeedView } from '$lib/shared/views';
	import FeedButton from '$lib/components/app/feed-button.svelte';
	import IconPicker from '$lib/components/app/marks/icon-picker.svelte';
	import MarkIcon from '$lib/components/app/marks/mark-icon.svelte';
	import { saveSettings } from '$lib/save-settings';
	import {
		CATEGORY_INBOX_OPTIONS,
		CATEGORY_PUSH_OPTIONS,
		CATEGORY_TRIAGE_OPTIONS,
		DEFAULT_CATEGORIES,
		DEFAULT_SNOOZE_HOURS,
		DEFAULT_TAGS,
		FALLBACK_CATEGORY_ID,
		MARK_COLORS,
		MAX_CATEGORIES,
		MAX_DESCRIPTION_CHARS,
		MAX_SNOOZE_HOURS,
		MAX_TAGS,
		validateCategories,
		validateTags
	} from '$lib/shared/categories';
	import type { ItemCategory, ItemTag, MarkColor } from '$lib/shared/types';
	import { MARK_DOT } from '$lib/marks';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import QueryInput from '$lib/components/app/query-input.svelte';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const me = createQuery(meQuery);
	const feeds = createQuery(feedsQuery);

	interface Draft {
		categories: ItemCategory[];
		tags: ItemTag[];
	}
	let draft = $state<Draft | null>(null);
	let saved = $state('');
	$effect(() => {
		const settings = me.data?.settings;
		untrack(() => {
			if (settings && !draft) {
				const initial: Draft = { categories: settings.categories, tags: settings.tags };
				draft = structuredClone($state.snapshot(initial));
				saved = JSON.stringify(initial);
				const wanted = page.url.searchParams.get('new');
				if (wanted === 'category')
					addCategory({
						rule: page.url.searchParams.get('rule') ?? '',
						inbox: page.url.searchParams.get('rule') === null ? undefined : 'fyi'
					});
				if (wanted === 'tag') addTag();
			}
		});
	});
	const dirty = $derived(!!draft && JSON.stringify(draft) !== saved);
	const error = $derived(
		draft ? (validateCategories(draft.categories) ?? validateTags(draft.tags)) : null
	);
	let saving = $state(false);
	let reevaluating = $state(false);

	beforeNavigate((nav) => {
		if (dirty && !confirm('Leave without saving your category and tag changes?')) nav.cancel();
	});

	const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

	function addCategory(start: Partial<ItemCategory> = {}) {
		if (!draft) return;
		const fallback = draft.categories.findIndex((c) => c.id === FALLBACK_CATEGORY_ID);
		const fresh: ItemCategory = {
			id: newId('category'),
			name: 'New category',
			color: 'blue',
			rule: '',
			description: '',
			...start
		};
		const list = [...draft.categories];
		list.splice(fallback < 0 ? list.length : fallback, 0, fresh);
		draft.categories = list;
		openCategory = fresh.id;
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-category="${fresh.id}"]`)?.focus()
		);
	}

	function addTag() {
		if (!draft) return;
		const fresh: ItemTag = { id: newId('tag'), name: 'New tag', color: 'amber', rule: '' };
		draft.tags = [...draft.tags, fresh];
		openTag = fresh.id;
		void tick().then(() =>
			document.querySelector<HTMLInputElement>(`[data-tag="${fresh.id}"]`)?.focus()
		);
	}

	const labelOf = (options: { id: string; label: string }[], id: string) =>
		options.find((o) => o.id === id)?.label ?? id;

	let openCategory = $state<string | null>(null);
	let openTag = $state<string | null>(null);
	const DRAWER = { duration: 180, easing: cubicOut };

	function categorySummary(c: ItemCategory): string {
		const placement = c.rule.trim()
			? c.rule.trim()
			: c.description.trim()
				? `Jev: ${c.description.trim()}`
				: c.id === FALLBACK_CATEGORY_ID
					? 'Everything else'
					: 'No rule or description yet';
		const effects = [
			(c.inbox ?? 'auto') !== 'auto' && labelOf(CATEGORY_INBOX_OPTIONS, c.inbox!),
			(c.push ?? 'inherit') !== 'inherit' && labelOf(CATEGORY_PUSH_OPTIONS, c.push!),
			c.triage === 'done' && 'Move to Done',
			c.triage === 'snooze' && `Snooze ${c.snoozeHours ?? DEFAULT_SNOOZE_HOURS}h`
		].filter(Boolean);
		return [placement, ...effects].join(' · ');
	}

	function setIcon(c: ItemCategory, icon: string | undefined) {
		if (icon) c.icon = icon;
		else delete c.icon;
	}

	function setTriage(c: ItemCategory, triage: string) {
		if (triage === 'done' || triage === 'snooze') c.triage = triage;
		else delete c.triage;
		if (c.triage === 'snooze') c.snoozeHours ??= DEFAULT_SNOOZE_HOURS;
		else delete c.snoozeHours;
	}

	function move<T>(list: T[], i: number, d: number): T[] {
		const next = [...list];
		[next[i], next[i + d]] = [next[i + d], next[i]];
		return next;
	}

	async function save() {
		if (!draft || error) return;
		saving = true;
		if (await saveSettings($state.snapshot(draft), 'Categories and tags saved'))
			saved = JSON.stringify(draft);
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

<svelte:head><title>Categories & tags · Settings · Hush</title></svelte:head>

{#snippet colorPicker(
	color: MarkColor,
	onpick: (c: MarkColor) => void,
	label: string,
	kind: 'category' | 'tag' = 'category'
)}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="flex size-8 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
			aria-label="{label} colour"
		>
			{#if kind === 'tag'}<MarkIcon kind="tag" {color} class="size-4" />{:else}<span
					class={cn('size-3 rounded-full', MARK_DOT[color])}
				></span>{/if}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="grid grid-cols-5 gap-1.5 p-2">
			{#each MARK_COLORS as c (c)}
				<button
					type="button"
					class={cn(
						'flex size-7 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:bg-muted',
						c === color && 'bg-muted'
					)}
					aria-label={c}
					aria-pressed={c === color}
					onclick={() => onpick(c)}
				>
					<span
						class={cn(
							'size-3.5 rounded-full',
							MARK_DOT[c],
							c === color && 'ring-2 ring-background ring-offset-1 ring-offset-foreground/50'
						)}
					></span>
				</button>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#snippet inboxControls(c: ItemCategory)}
	<div class="flex flex-wrap items-end gap-2">
		<div class="grid gap-1">
			<span class="text-xs font-medium text-muted-foreground">In the inbox</span>
			<Select.Root
				type="single"
				value={c.inbox ?? 'auto'}
				onValueChange={(v) => (c.inbox = v as ItemCategory['inbox'])}
			>
				<Select.Trigger size="sm" class="w-44" aria-label="{c.name}: in the inbox"
					>{labelOf(CATEGORY_INBOX_OPTIONS, c.inbox ?? 'auto')}</Select.Trigger
				>
				<Select.Content>
					{#each CATEGORY_INBOX_OPTIONS as o (o.id)}
						<Select.Item value={o.id} label={o.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="grid gap-1">
			<span class="text-xs font-medium text-muted-foreground">Push</span>
			<Select.Root
				type="single"
				value={c.push ?? 'inherit'}
				onValueChange={(v) => (c.push = v as ItemCategory['push'])}
			>
				<Select.Trigger size="sm" class="w-56" aria-label="{c.name}: push"
					>{labelOf(CATEGORY_PUSH_OPTIONS, c.push ?? 'inherit')}</Select.Trigger
				>
				<Select.Content>
					{#each CATEGORY_PUSH_OPTIONS as o (o.id)}
						<Select.Item value={o.id} label={o.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="grid gap-1">
			<span class="text-xs font-medium text-muted-foreground">New threads</span>
			<Select.Root type="single" value={c.triage ?? 'none'} onValueChange={(v) => setTriage(c, v)}>
				<Select.Trigger size="sm" class="w-44" aria-label="{c.name}: new threads"
					>{labelOf(CATEGORY_TRIAGE_OPTIONS, c.triage ?? 'none')}</Select.Trigger
				>
				<Select.Content>
					{#each CATEGORY_TRIAGE_OPTIONS as o (o.id)}
						<Select.Item value={o.id} label={o.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		{#if c.triage === 'snooze'}
			<label class="grid gap-1">
				<span class="text-xs font-medium text-muted-foreground">Hours</span>
				<Input
					type="number"
					min={1}
					max={MAX_SNOOZE_HOURS}
					bind:value={c.snoozeHours}
					class="h-8 w-20"
					aria-label="{c.name}: snooze hours"
				/>
			</label>
		{/if}
	</div>
{/snippet}

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Categories & tags</h1>
		<p class="text-sm text-muted-foreground">
			Every pull request, issue, and notification has exactly one category, and PRs and issues can
			have any number of tags. A category also decides what its notifications do in the inbox. Rules
			use the
			<a class="underline" href="/docs/query-language" target="_blank" rel="noreferrer"
				>query language</a
			>; <code>about:"…"</code> asks Jev.
		</p>
	</div>

	{#if draft}
		<Card.Root id="categories">
			<Card.Header>
				<div class="flex items-start justify-between gap-2">
					<div class="grid gap-1.5">
						<Card.Title>Categories</Card.Title>
						<Card.Description>
							Top to bottom: the first rule that matches wins. Without a match, Jev picks among the
							categories with a description. Without that, the item goes to the last one.
						</Card.Description>
					</div>
					<Button
						variant="ghost"
						size="xs"
						onclick={() => draft && (draft.categories = structuredClone(DEFAULT_CATEGORIES))}
					>
						<RotateCcw /> Defaults
					</Button>
				</div>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<ul class="grid gap-1.5" id="category-list">
					{#each draft.categories as c, i (c.id)}
						{@const fallback = c.id === FALLBACK_CATEGORY_ID}
						{@const expanded = openCategory === c.id}
						<li class={cn('rounded-lg border', expanded && 'bg-muted/30')}>
							<div class="flex items-center gap-1.5 p-1.5">
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
									<span class="block truncate text-xs text-muted-foreground"
										>{categorySummary(c)}</span
									>
								</button>
								<FeedButton
									view={markFeedView('category', c.id)}
									name={c.name}
									feeds={feeds.data}
								/>
								{#if !fallback}
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label="Move up"
										disabled={i === 0}
										onclick={() => draft && (draft.categories = move(draft.categories, i, -1))}
										><ArrowUp /></Button
									>
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label="Move down"
										disabled={draft.categories[i + 1]?.id === FALLBACK_CATEGORY_ID ||
											i === draft.categories.length - 1}
										onclick={() => draft && (draft.categories = move(draft.categories, i, 1))}
										><ArrowDown /></Button
									>
								{/if}
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={expanded ? `Close ${c.name}` : `Edit ${c.name}`}
									onclick={() => (openCategory = expanded ? null : c.id)}
									><ChevronDown
										class={cn('transition-transform', expanded && 'rotate-180')}
									/></Button
								>
							</div>
							{#if expanded}
								<div
									id="category-{c.id}-details"
									class="grid gap-2 border-t p-2.5"
									transition:slide={DRAWER}
								>
									<div class="flex items-center gap-2">
										<Input
											bind:value={c.name}
											data-name
											data-category={c.id}
											aria-label="Category name"
											class="h-8 min-w-0 flex-1"
										/>
										{#if !fallback}
											<Button
												variant="ghost"
												size="sm"
												class="text-destructive"
												onclick={() =>
													draft &&
													(draft.categories = draft.categories.filter((x) => x.id !== c.id))}
												><Trash /> Delete</Button
											>
										{/if}
									</div>
									{#if fallback}
										<p class="text-xs text-muted-foreground">
											The fallback: items that no rule and no Jev choice place go here. It cannot be
											deleted.
										</p>
									{:else}
										<QueryInput
											bind:value={c.rule}
											id="category-{c.id}-rule"
											label="Rule (optional)"
											placeholder="repo:acme/api label:bug OR about:&quot;a crash&quot;"
										/>
										<div class="grid gap-1">
											<label
												for="category-{c.id}-description"
												class="text-xs font-medium text-muted-foreground"
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
									{/if}
									{@render inboxControls(c)}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<div>
					<Button
						variant="outline"
						size="sm"
						onclick={addCategory}
						disabled={draft.categories.length >= MAX_CATEGORIES}><Plus /> Add category</Button
					>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root id="tags">
			<Card.Header>
				<div class="flex items-start justify-between gap-2">
					<div class="grid gap-1.5">
						<Card.Title>Tags</Card.Title>
						<Card.Description>
							Each tag is checked on its own: an item gets every tag whose rule matches.
						</Card.Description>
					</div>
					<Button
						variant="ghost"
						size="xs"
						onclick={() => draft && (draft.tags = structuredClone(DEFAULT_TAGS))}
					>
						<RotateCcw /> Defaults
					</Button>
				</div>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<ul class="grid gap-1.5" id="tag-list">
					{#each draft.tags as t (t.id)}
						{@const expanded = openTag === t.id}
						<li class={cn('rounded-lg border', expanded && 'bg-muted/30')}>
							<div class="flex items-center gap-1.5 p-1.5">
								{@render colorPicker(t.color, (color) => (t.color = color), t.name, 'tag')}
								<button
									type="button"
									class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
									aria-expanded={expanded}
									aria-controls="tag-{t.id}-details"
									onclick={() => (openTag = expanded ? null : t.id)}
								>
									<span class="block truncate text-sm font-medium">{t.name || 'Untitled'}</span>
									<span class="block truncate text-xs text-muted-foreground"
										>{t.rule.trim() ||
											'No rule yet: set it by hand from the right-click menu'}</span
									>
								</button>
								<FeedButton view={markFeedView('tag', t.id)} name={t.name} feeds={feeds.data} />
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={expanded ? `Close ${t.name}` : `Edit ${t.name}`}
									onclick={() => (openTag = expanded ? null : t.id)}
									><ChevronDown
										class={cn('transition-transform', expanded && 'rotate-180')}
									/></Button
								>
							</div>
							{#if expanded}
								<div
									id="tag-{t.id}-details"
									class="grid gap-2 border-t p-2.5"
									transition:slide={DRAWER}
								>
									<div class="flex items-center gap-2">
										<Input
											bind:value={t.name}
											data-name
											data-tag={t.id}
											aria-label="Tag name"
											class="h-8 min-w-0 flex-1"
										/>
										<Button
											variant="ghost"
											size="sm"
											class="text-destructive"
											onclick={() =>
												draft && (draft.tags = draft.tags.filter((x) => x.id !== t.id))}
											><Trash /> Delete</Button
										>
									</div>
									<QueryInput
										bind:value={t.rule}
										id="tag-{t.id}-rule"
										label="Rule"
										placeholder="about:&quot;waits on something outside the author's control&quot;"
									/>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<div>
					<Button
						variant="outline"
						size="sm"
						onclick={addTag}
						disabled={draft.tags.length >= MAX_TAGS}><Plus /> Add tag</Button
					>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Re-evaluate items</Card.Title>
				<Card.Description>
					Jev reads each item once, when Hush first sees it, and again when its title, description,
					or labels change. After you change categories or tags, ask again for the items you have
					now. Rules without Jev apply at once.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" size="sm" onclick={reevaluate} disabled={reevaluating || dirty}>
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
			<Button variant="ghost" size="sm" onclick={() => (draft = JSON.parse(saved))}>Discard</Button>
			<Button size="sm" onclick={save} disabled={!!error || saving}>Save</Button>
		</div>
	{/if}
</div>
