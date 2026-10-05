<script lang="ts" module>
	export interface RulePreview {
		matched: number;
		total: number;
		noun: string;
		examples: { title: string; detail: string }[];
		jevDecides: boolean;
	}

	export const RULE_TEMPLATES: { label: string; query: string }[] = [
		{ label: 'Opened by a bot', query: 'author:bots' },
		{ label: 'Dependency updates', query: 'author:dependabot*,renovate*' },
		{ label: 'Docs', query: 'label:docs,documentation' },
		{ label: 'Small pull requests', query: 'type:pr size:<50' },
		{ label: 'Big pull requests', query: 'type:pr size:>500' },
		{ label: 'Drafts', query: 'is:draft' },
		{ label: 'About security (Jev)', query: 'about:"security, vulnerabilities, or secrets"' }
	];
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import {
		BUILDER_FIELDS,
		builderToQuery,
		describeBuilder,
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
		exclude = [],
		allowGroups = true,
		suggestions = {},
		preview,
		templates = RULE_TEMPLATES
	}: {
		value: string;
		id: string;
		label?: string;
		exclude?: string[];
		allowGroups?: boolean;
		suggestions?: Partial<Record<NonNullable<BuilderField['suggest']>, string[]>>;
		preview?: (query: string) => RulePreview | null;
		templates?: { label: string; query: string }[];
	} = $props();

	const fields = $derived(BUILDER_FIELDS.filter((f) => !exclude.includes(f.word)));
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
	const summary = $derived(describeBuilder(builder));
	const result = $derived(preview ? preview(value) : null);

	const replaceItem = (k: number, item: BuilderState['items'][number] | null) =>
		commit({
			...builder,
			items: item
				? builder.items.map((x, i) => (i === k ? item : x))
				: builder.items.filter((_, i) => i !== k)
		});

	const defaultWord = $derived(fields[0]?.word ?? 'repo');
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
					<DropdownMenu.Content align="end" class="w-56">
						{#each templates as t (t.label)}
							<DropdownMenu.Item onclick={() => useTemplate(t.query)}>
								<span class="flex-1">{t.label}</span>
								<span class="font-mono text-[0.65rem] text-muted-foreground">{t.query}</span>
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
		<div class="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-dashed p-2.5">
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
								class="rounded p-1 hover:bg-background hover:text-foreground"
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
		<div class="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
			<p class="font-medium">
				Matches {result.matched} of {result.total}
				{result.noun}{#if result.jevDecides}<span class="font-normal text-muted-foreground">
						· Jev decides the about: part later</span
					>{/if}
			</p>
			{#each result.examples as e (e.title + e.detail)}
				<p class="mt-1 truncate text-muted-foreground">
					<span class="text-foreground">{e.title}</span> · {e.detail}
				</p>
			{/each}
		</div>
	{/if}
</div>
