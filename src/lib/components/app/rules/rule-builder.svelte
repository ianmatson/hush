<script lang="ts" module>
	export interface RulePreview {
		matched: number;
		total: number;
		noun: string;
		examples: { title: string; detail: string; url: string }[];
		jevDecides: boolean;
	}

	import type { Component } from 'svelte';
	import Bot from '@lucide/svelte/icons/bot';
	import Package from '@lucide/svelte/icons/package';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Feather from '@lucide/svelte/icons/feather';
	import Weight from '@lucide/svelte/icons/weight';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';

	export interface RuleTemplate {
		label: string;
		hint: string;
		query: string;
		icon: Component;
		jev?: boolean;
	}

	export const RULE_TEMPLATES: RuleTemplate[] = [
		{ label: 'Opened by a bot', hint: 'Any bot account', query: 'author:bots', icon: Bot },
		{
			label: 'Dependency updates',
			hint: 'Dependabot and Renovate',
			query: 'author:dependabot*,renovate*',
			icon: Package
		},
		{
			label: 'Docs',
			hint: 'Labeled docs or documentation',
			query: 'label:docs,documentation',
			icon: BookOpen
		},
		{
			label: 'Small pull requests',
			hint: 'Under 50 changed lines',
			query: 'type:pr size:<50',
			icon: Feather
		},
		{
			label: 'Big pull requests',
			hint: 'Over 500 changed lines',
			query: 'type:pr size:>500',
			icon: Weight
		},
		{ label: 'Drafts', hint: 'Draft pull requests', query: 'is:draft', icon: PencilLine },
		{
			label: 'About security',
			hint: 'Security, vulnerabilities, or secrets',
			query: 'about:"security, vulnerabilities, or secrets"',
			icon: ShieldAlert,
			jev: true
		}
	];
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import {
		BUILDER_FIELDS,
		builderToQuery,
		describeBuilder,
		MATCHES_EVERYTHING,
		emptyCondition,
		queryToBuilder,
		type BuilderCondition,
		type BuilderField,
		type BuilderGroup,
		type BuilderMode,
		type BuilderState
	} from '$lib/shared/rule-builder';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';
	import QueryInput from '../query-input.svelte';
	import ConditionRow from './condition-row.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Brackets from '@lucide/svelte/icons/brackets';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Code from '@lucide/svelte/icons/code';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import X from '@lucide/svelte/icons/x';

	let {
		value = $bindable(''),
		id,
		label = 'Rule',
		allowGroups = true,
		suggestions = {},
		preview,
		templates = RULE_TEMPLATES,
		emptyText
	}: {
		value: string;
		id: string;
		label?: string;
		allowGroups?: boolean;
		suggestions?: Partial<Record<NonNullable<BuilderField['suggest']>, string[]>>;
		preview?: (query: string) => RulePreview | null;
		templates?: RuleTemplate[];
		emptyText?: string;
	} = $props();

	const fields = BUILDER_FIELDS;
	const MODES: { value: BuilderMode; label: string }[] = [
		{ value: 'all', label: 'all' },
		{ value: 'any', label: 'any' }
	];

	let builder = $state<BuilderState>(
		untrack(() => queryToBuilder(value) ?? { mode: 'all', items: [] })
	);
	let textMode = $state(untrack(() => queryToBuilder(value) === null));
	let emitted = untrack(() => value);

	$effect(() => {
		const next = value;
		untrack(() => {
			if (next === emitted) return;
			emitted = next;
			const parsed = queryToBuilder(next);
			if (parsed) builder = parsed;
			else textMode = true;
		});
	});

	function commit(next: BuilderState) {
		builder = next;
		emitted = builderToQuery(next);
		value = emitted;
	}

	const canShowVisually = $derived(queryToBuilder(value) !== null);
	const summary = $derived.by(() => {
		const text = describeBuilder(builder);
		return emptyText && text === MATCHES_EVERYTHING ? emptyText : text;
	});
	const result = $derived(preview ? preview(value) : null);

	const replaceItem = (k: number, item: BuilderState['items'][number] | null) =>
		commit({
			...builder,
			items: item
				? builder.items.map((x, i) => (i === k ? item : x))
				: builder.items.filter((_, i) => i !== k)
		});

	const defaultWord = $derived(fields[0]?.word ?? 'repo');
	const HOVER_CLOSE_MS = 150;
	let matchesOpen = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	function showMatches(on: boolean) {
		clearTimeout(closeTimer);
		if (on) matchesOpen = true;
		else closeTimer = setTimeout(() => (matchesOpen = false), HOVER_CLOSE_MS);
	}

	const addCondition = () =>
		commit({ ...builder, items: [...builder.items, emptyCondition(defaultWord)] });
	const addGroup = () =>
		commit({
			...builder,
			items: [
				...builder.items,
				{
					type: 'group',
					mode: builder.mode === 'all' ? 'any' : 'all',
					conditions: [emptyCondition(defaultWord), emptyCondition(defaultWord)]
				}
			]
		});

	function setGroup(k: number, group: BuilderGroup) {
		replaceItem(k, group.conditions.length ? group : null);
	}

	function useTemplate(query: string) {
		const parsed = queryToBuilder(query);
		if (!parsed) return;
		textMode = false;
		commit(parsed);
	}
</script>

{#snippet modeSelect(mode: BuilderMode, onpick: (m: BuilderMode) => void, aria: string)}
	<Select.Root type="single" value={mode} onValueChange={(m) => onpick(m as BuilderMode)}>
		<Select.Trigger size="sm" class="h-6 w-16 px-2 text-xs" aria-label={aria}>{mode}</Select.Trigger
		>
		<Select.Content>
			{#each MODES as m (m.value)}
				<Select.Item value={m.value} label={m.label} />
			{/each}
		</Select.Content>
	</Select.Root>
{/snippet}

<div class="grid grid-cols-[minmax(0,1fr)] gap-2" role="group" aria-label={label}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<span class="text-xs font-medium text-muted-foreground">{label}</span>
		<div class="flex items-center gap-1">
			{#if templates.length}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="xs"><Sparkles /> Start from…</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-64">
						{#each templates as t (t.label)}
							<DropdownMenu.Item
								class="items-start gap-2.5 py-2"
								onclick={() => useTemplate(t.query)}
							>
								<t.icon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<span class="grid min-w-0 flex-1 gap-0.5">
									<span class="flex items-center gap-1.5 truncate text-sm"
										>{t.label}{#if t.jev}<span
												class="rounded bg-violet-500/10 px-1 py-px text-[0.65rem] font-medium text-violet-600 dark:text-violet-300"
												>Jev</span
											>{/if}</span
									>
									<span class="truncate text-xs text-muted-foreground">{t.hint}</span>
								</span>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			{#if textMode}
				<Button
					variant="ghost"
					size="xs"
					disabled={!canShowVisually}
					title={canShowVisually
						? undefined
						: 'This query has more nesting than the builder shows.'}
					onclick={() => {
						builder = queryToBuilder(value) ?? builder;
						textMode = false;
					}}><ListChecks /> Visual</Button
				>
			{:else}
				<Button variant="ghost" size="xs" onclick={() => (textMode = true)}><Code /> Text</Button>
			{/if}
		</div>
	</div>

	{#if textMode}
		<QueryInput bind:value {id} label="Query" />
		{#if !canShowVisually && value.trim()}
			<p class="text-xs text-muted-foreground">
				The visual builder shows one level of groups. This query stays in text.
			</p>
		{/if}
	{:else}
		<div
			class="grid grid-cols-[minmax(0,1fr)] gap-2 sm:rounded-lg sm:border sm:border-dashed sm:p-2.5"
		>
			{#if builder.items.length > 1}
				<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
					Match {@render modeSelect(
						builder.mode,
						(mode) => commit({ ...builder, mode }),
						'Match all or any'
					)} of these
				</div>
			{/if}
			{#each builder.items as item, k (k)}
				{#if item.type === 'condition'}
					<ConditionRow
						condition={item}
						{fields}
						{suggestions}
						onchange={(next: BuilderCondition) => replaceItem(k, next)}
						onremove={() => replaceItem(k, null)}
					/>
				{:else}
					<div class="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg bg-muted/50 p-2">
						<div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
							<span class="flex items-center gap-1.5"
								>{@render modeSelect(
									item.mode,
									(mode) => setGroup(k, { ...item, mode }),
									'Group: all or any'
								)} of these</span
							>
							<button
								type="button"
								class="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-background hover:text-foreground"
								aria-label="Remove group"
								onclick={() => replaceItem(k, null)}><X class="size-3.5" /></button
							>
						</div>
						{#each item.conditions as c, j (j)}
							<ConditionRow
								condition={c}
								{fields}
								{suggestions}
								onchange={(next: BuilderCondition) =>
									setGroup(k, {
										...item,
										conditions: item.conditions.map((x, i) => (i === j ? next : x))
									})}
								onremove={() =>
									setGroup(k, { ...item, conditions: item.conditions.filter((_, i) => i !== j) })}
							/>
						{/each}
						<div>
							<Button
								variant="ghost"
								size="xs"
								onclick={() =>
									setGroup(k, {
										...item,
										conditions: [...item.conditions, emptyCondition(defaultWord)]
									})}><Plus /> Condition</Button
							>
						</div>
					</div>
				{/if}
			{:else}
				<p class="text-xs text-muted-foreground">No conditions yet.</p>
			{/each}
			<div class="flex flex-wrap gap-1">
				<Button variant="outline" size="xs" onclick={addCondition}><Plus /> Condition</Button>
				{#if allowGroups}
					<Button variant="ghost" size="xs" onclick={addGroup}><Brackets /> Group</Button>
				{/if}
			</div>
		</div>
		<p class="text-xs text-muted-foreground">{summary}</p>
	{/if}

	{#if result}
		<p class="rounded-lg bg-muted/40 px-2.5 py-2 text-xs font-medium">
			Matches
			{#if result.matched}
				<Popover.Root bind:open={matchesOpen}>
					<Popover.Trigger
						class="cursor-help underline decoration-muted-foreground/60 decoration-dotted underline-offset-2 hover:decoration-foreground"
						onmouseenter={() => showMatches(true)}
						onmouseleave={() => showMatches(false)}
						>{result.matched} of {result.total} {result.noun}</Popover.Trigger
					>
					<Popover.Content
						align="start"
						class="w-[min(28rem,calc(100vw-2rem))] p-1"
						onmouseenter={() => showMatches(true)}
						onmouseleave={() => showMatches(false)}
						onOpenAutoFocus={(e) => e.preventDefault()}
					>
						<ul class="grid max-h-72 grid-cols-[minmax(0,1fr)] gap-0.5 overflow-y-auto">
							{#each result.examples as e, k (k)}
								<li>
									<a
										href={e.url}
										target="_blank"
										rel="noreferrer"
										class="grid grid-cols-[minmax(0,1fr)] rounded-md px-2 py-1.5 text-xs hover:bg-muted"
									>
										<span class="truncate font-medium">{e.title}</span>
										<span class="truncate text-muted-foreground">{e.detail}</span>
									</a>
								</li>
							{/each}
						</ul>
						{#if result.matched > result.examples.length}
							<p class="px-2 py-1.5 text-xs text-muted-foreground">
								And {result.matched - result.examples.length} more.
							</p>
						{/if}
					</Popover.Content>
				</Popover.Root>
			{:else}
				0 of {result.total} {result.noun}
			{/if}{#if result.jevDecides}<span class="font-normal text-muted-foreground">
					· Jev decides the about: part later</span
				>{/if}
		</p>
	{/if}
</div>
