<script lang="ts">
	import { builderField, type BuilderCondition, type BuilderField } from '$lib/shared/rule-builder';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import ChipInput from './chip-input.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';

	let {
		condition,
		fields,
		suggestions = {},
		onchange,
		onremove
	}: {
		condition: BuilderCondition;
		fields: BuilderField[];
		suggestions?: Partial<Record<NonNullable<BuilderField['suggest']>, string[]>>;
		onchange: (next: BuilderCondition) => void;
		onremove: () => void;
	} = $props();

	const field = $derived(builderField(condition.word) ?? fields[0]);
	const set = (patch: Partial<BuilderCondition>) => onchange({ ...condition, ...patch });

	const SIZE_OPS = [
		{ value: '<', label: 'under' },
		{ value: '>', label: 'over' },
		{ value: '..', label: 'between' }
	];
	const sizeParts = $derived.by(() => {
		const v = condition.values[0] ?? '';
		const range = /^(\d+)\.\.(\d+)$/.exec(v);
		if (range) return { op: '..', a: range[1], b: range[2] };
		const m = /^(<=?|>=?)?(\d*)$/.exec(v);
		return { op: m?.[1]?.startsWith('>') ? '>' : '<', a: m?.[2] ?? '', b: '' };
	});
	function setSize(op: string, a: string, b: string) {
		const value = op === '..' ? (a && b ? `${a}..${b}` : '') : a ? `${op}${a}` : '';
		set({ values: value ? [value] : [] });
	}

	const negateOptions = [
		{ value: 'is', label: 'is' },
		{ value: 'not', label: 'is not' }
	];
</script>

<div class="flex flex-wrap items-start gap-1.5">
	<Select.Root
		type="single"
		value={condition.word}
		onValueChange={(word) => set({ word, values: [], negate: false })}
	>
		<Select.Trigger size="sm" class="w-44" aria-label="Field"
			><span class="truncate">{field.label}</span></Select.Trigger
		>
		<Select.Content class="max-h-72">
			{#each fields as f (f.word)}
				<Select.Item value={f.word} label={f.label} />
			{/each}
		</Select.Content>
	</Select.Root>

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
			<Select.Root
				type="single"
				value={sizeParts.op}
				onValueChange={(op) => setSize(op, sizeParts.a, sizeParts.b)}
			>
				<Select.Trigger size="sm" class="w-26" aria-label="Size comparison"
					>{SIZE_OPS.find((o) => o.value === sizeParts.op)?.label}</Select.Trigger
				>
				<Select.Content>
					{#each SIZE_OPS as o (o.value)}
						<Select.Item value={o.value} label={o.label} />
					{/each}
				</Select.Content>
			</Select.Root>
			<Input
				type="number"
				min={0}
				class="h-7 w-20"
				aria-label="Lines"
				value={sizeParts.a}
				oninput={(e) => setSize(sizeParts.op, e.currentTarget.value, sizeParts.b)}
			/>
			{#if sizeParts.op === '..'}
				<span class="text-xs text-muted-foreground">and</span>
				<Input
					type="number"
					min={0}
					class="h-7 w-20"
					aria-label="Up to lines"
					value={sizeParts.b}
					oninput={(e) => setSize(sizeParts.op, sizeParts.a, e.currentTarget.value)}
				/>
			{/if}
			<span class="text-xs text-muted-foreground">lines</span>
		{:else if field.input === 'about' || field.input === 'text'}
			<Input
				class="h-7 min-w-0 flex-1"
				placeholder={field.placeholder}
				aria-label={field.label}
				value={condition.values[0] ?? ''}
				oninput={(e) => set({ values: e.currentTarget.value ? [e.currentTarget.value] : [] })}
			/>
			{#if field.input === 'about'}
				<span
					class="flex shrink-0 items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[0.7rem] text-violet-600 dark:text-violet-300"
					title="Jev reads each item and decides whether this is true. It uses Jev calls."
					><Sparkles class="size-3" />Jev</span
				>
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
