<script lang="ts">
	import { untrack } from 'svelte';
	import {
		builderField,
		SIZE_COMPARISONS,
		sizeDraftOf,
		sizeValue,
		type BuilderCondition,
		type BuilderField,
		type SizeComparison,
		type SizeDraft,
		type ValueSuggestions
	} from '$lib/shared/rule-builder';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import ChipInput from './chip-input.svelte';
	import SearchSelect, { type SearchSelectGroup } from '../search-select.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import Tip from '$lib/components/app/tip.svelte';

	let {
		condition,
		fields,
		suggestions = {},
		onchange,
		onremove
	}: {
		condition: BuilderCondition;
		fields: BuilderField[];
		suggestions?: ValueSuggestions;
		onchange: (next: BuilderCondition) => void;
		onremove: () => void;
	} = $props();

	const field = $derived(builderField(condition.word) ?? fields[0]);
	const FIELD_GROUPS: { runs: BuilderField['runs']; heading: string }[] = [
		{ runs: 'both', heading: 'GitHub and Hush' },
		{ runs: 'hush', heading: 'Hush only' },
		{ runs: 'github', heading: 'GitHub only' }
	];
	const fieldGroups = $derived(
		FIELD_GROUPS.map((g) => ({ ...g, fields: fields.filter((f) => f.runs === g.runs) })).filter(
			(g) => g.fields.length
		)
	);
	const fieldChoices = $derived<SearchSelectGroup[]>(
		fieldGroups.map((g) => ({
			heading: fieldGroups.length > 1 ? g.heading : undefined,
			options: g.fields.map((f) => ({ value: f.word, label: f.label }))
		}))
	);
	const set = (patch: Partial<BuilderCondition>) => onchange({ ...condition, ...patch });

	let sizeDraft = $state(untrack(() => sizeDraftOf(condition.values[0] ?? '')));
	$effect.pre(() => {
		const value = condition.values[0] ?? '';
		untrack(() => {
			if (value !== sizeValue(sizeDraft)) sizeDraft = sizeDraftOf(value);
		});
	});
	function setSize(patch: Partial<SizeDraft>) {
		sizeDraft = { ...sizeDraft, ...patch };
		const value = sizeValue(sizeDraft);
		set({ values: value ? [value] : [] });
	}

	const negateOptions = [
		{ value: 'is', label: 'is' },
		{ value: 'not', label: 'is not' }
	];
</script>

<div
	class="flex flex-wrap items-start gap-1.5 rounded-md border bg-background p-1.5 sm:border-0 sm:bg-transparent sm:p-0"
>
	<SearchSelect
		value={field.word}
		groups={fieldChoices}
		onchange={(word) => set({ word, values: [], negate: false })}
		label="Field"
		size="sm"
		class="w-full sm:w-44"
	/>

	{#if field.canNegate}
		<Select.Root
			type="single"
			value={condition.negate ? 'not' : 'is'}
			onValueChange={(v) => set({ negate: v === 'not' })}
		>
			<Select.Trigger size="sm" class="w-22" aria-label="Is or is not"
				>{condition.negate ? 'is not' : 'is'}</Select.Trigger
			>
			<Select.Content>
				{#each negateOptions as o (o.value)}
					<Select.Item value={o.value} label={o.label} />
				{/each}
			</Select.Content>
		</Select.Root>
	{/if}

	<div class="flex min-w-48 flex-1 items-center gap-1.5">
		{#if field.input === 'choice'}
			<Select.Root
				type="single"
				value={condition.values[0] ?? ''}
				onValueChange={(v) => set({ values: v ? [v] : [] })}
			>
				<Select.Trigger size="sm" class="min-w-0 flex-1" aria-label={field.label}
					>{field.options?.find((o) => o.value === condition.values[0])?.label ??
						'Choose…'}</Select.Trigger
				>
				<Select.Content class="max-h-72">
					{#each field.options ?? [] as o (o.value)}
						<Select.Item value={o.value} label={o.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		{:else if field.input === 'size'}
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
				<Select.Root
					type="single"
					value={sizeDraft.op}
					onValueChange={(op) => setSize({ op: op as SizeComparison })}
				>
					<Select.Trigger size="sm" class="w-26" aria-label="Comparison"
						>{SIZE_COMPARISONS.find((o) => o.value === sizeDraft.op)?.label}</Select.Trigger
					>
					<Select.Content>
						{#each SIZE_COMPARISONS as o (o.value)}
							<Select.Item value={o.value} label={o.label} />
						{/each}
					</Select.Content>
				</Select.Root>
				<div class="flex min-w-0 items-center gap-1.5">
					<Input
						type="number"
						min={0}
						class="h-7 w-24 min-w-20"
						aria-label="Number of {field.unit ?? 'lines'}"
						value={sizeDraft.from}
						oninput={(e) => setSize({ from: e.currentTarget.value })}
					/>
					{#if sizeDraft.op === '..'}
						<span class="text-xs text-muted-foreground">and</span>
						<Input
							type="number"
							min={0}
							class="h-7 w-24 min-w-20"
							aria-label="Up to this number of {field.unit ?? 'lines'}"
							value={sizeDraft.to}
							oninput={(e) => setSize({ to: e.currentTarget.value })}
						/>
					{/if}
					<span class="text-xs text-muted-foreground">{field.unit ?? 'lines'}</span>
				</div>
			</div>
		{:else if field.input === 'about' || field.input === 'text'}
			<Input
				class="h-7 min-w-0 flex-1"
				placeholder={field.placeholder}
				aria-label={field.label}
				value={condition.values[0] ?? ''}
				oninput={(e) => set({ values: e.currentTarget.value ? [e.currentTarget.value] : [] })}
			/>
			{#if field.input === 'about'}
				<Tip
					focusable={false}
					text="Jev reads each item and decides whether this is true. It uses Jev calls."
				>
					{#snippet children(props)}
						<span
							{...props}
							class="flex shrink-0 items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[0.7rem] text-violet-600 dark:text-violet-300"
							><Sparkles class="size-3" />Jev</span
						>
					{/snippet}
				</Tip>
			{/if}
		{:else}
			<ChipInput
				values={condition.values}
				onchange={(values) => set({ values })}
				placeholder={field.placeholder}
				suggestions={field.suggest ? (suggestions[field.suggest] ?? []) : []}
				label={field.label}
			/>
		{/if}
		<button
			type="button"
			class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
			aria-label="Remove condition"
			onclick={onremove}><X class="size-3.5" /></button
		>
	</div>
</div>
