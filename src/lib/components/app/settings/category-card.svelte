<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { describeBuilder, queryToBuilder } from '$lib/shared/rule-builder';
	import { categoryFeedView } from '$lib/shared/views';
	import { MAX_DESCRIPTION_CHARS, MAX_MARK_NAME_CHARS } from '$lib/shared/categories';
	import type { FeedDTO, ItemCategory } from '$lib/shared/types';
	import { previewItems, ruleSuggestions } from '$lib/rule-preview';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import FeedButton from '$lib/components/app/feed-button.svelte';
	import IconPicker from '$lib/components/app/marks/icon-picker.svelte';
	import RuleBuilder from '$lib/components/app/rules/rule-builder.svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Trash from '@lucide/svelte/icons/trash';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let {
		category = $bindable(),
		handle,
		expanded,
		hasFeed,
		feeds,
		headerOnly = false,
		ontoggle,
		ondelete
	}: {
		category: ItemCategory;
		handle: Snippet | null;
		expanded: boolean;
		hasFeed: boolean;
		feeds: FeedDTO[] | undefined;
		headerOnly?: boolean;
		ontoggle: () => void;
		ondelete: () => void;
	} = $props();

	const NO_RULE = 'No rule: only Jev, or your own choice, puts items here.';
	const DRAWER = { duration: 180, easing: cubicOut };

	const me = createQuery(meQuery);
	const suggestions = $derived(ruleSuggestions(me.data?.settings));

	function ruleWords(rule: string): string {
		const builder = queryToBuilder(rule);
		return builder ? describeBuilder(builder).replace(/\.$/, '') : rule.trim();
	}

	const summary = $derived.by(() => {
		const parts = [
			category.rule.trim() && ruleWords(category.rule),
			category.description.trim() && `Jev: ${category.description.trim()}`
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : 'No rule or description yet';
	});

	function setIcon(icon: string | undefined) {
		if (icon) category.icon = icon;
		else delete category.icon;
	}
</script>

<div class="flex items-center gap-1.5 p-1.5">
	{#if handle}
		{@render handle()}
	{:else}
		<span class="flex size-6 shrink-0 items-center justify-center text-muted-foreground/60"
			><GripVertical class="size-4" /></span
		>
	{/if}
	<IconPicker
		icon={category.icon}
		color={category.color}
		label={category.name}
		onpick={setIcon}
		oncolor={(color) => (category.color = color)}
	/>
	<button
		type="button"
		class="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
		aria-expanded={expanded}
		aria-controls="category-{category.id}-details"
		onclick={ontoggle}
	>
		<span class="block truncate text-sm font-medium">{category.name || 'Untitled'}</span>
		<span class="block truncate text-xs text-muted-foreground">{summary}</span>
	</button>
	{#if hasFeed}
		<FeedButton view={categoryFeedView(category.id)} name={category.name} {feeds} />
	{/if}
	<Button
		variant="ghost"
		size="icon-xs"
		aria-label={expanded ? `Close ${category.name}` : `Edit ${category.name}`}
		onclick={ontoggle}
		><ChevronDown class={cn('transition-transform', expanded && 'rotate-180')} /></Button
	>
</div>
{#if !headerOnly}
	<div data-no-drag>
		{#if expanded}
			<div
				id="category-{category.id}-details"
				class="grid grid-cols-[minmax(0,1fr)] gap-2 border-t p-2.5"
				transition:slide={DRAWER}
			>
				<div class="flex items-center gap-2">
					<Input
						bind:value={category.name}
						data-name
						data-category={category.id}
						aria-label="Category name"
						maxlength={MAX_MARK_NAME_CHARS}
						class="h-8 min-w-0 flex-1"
					/>
					<Button variant="ghost" size="sm" class="text-destructive" onclick={ondelete}
						><Trash /> Delete</Button
					>
				</div>
				<RuleBuilder
					bind:value={category.rule}
					id="category-{category.id}-rule"
					label="Rule (optional)"
					emptyText={NO_RULE}
					{suggestions}
					preview={(q) => (me.data ? previewItems(q, me.data.login, me.data.settings) : null)}
				/>
				<div class="grid gap-1">
					<label
						for="category-{category.id}-description"
						class="text-xs font-medium text-muted-foreground">Description for Jev (optional)</label
					>
					<Input
						id="category-{category.id}-description"
						bind:value={category.description}
						maxlength={MAX_DESCRIPTION_CHARS}
						class="h-8 text-xs"
						placeholder="What belongs here, in a few words"
					/>
				</div>
			</div>
		{/if}
	</div>
{/if}
