<script lang="ts">
	import { untrack } from 'svelte';
	import {
		describeSearch,
		formatSearch,
		parseSearch,
		RAW_KEY,
		SEARCH_FIELDS,
		searchField,
		type SearchCondition
	} from '$lib/shared/github-search';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import Plus from '@lucide/svelte/icons/plus';
	import Code from '@lucide/svelte/icons/code';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import X from '@lucide/svelte/icons/x';

	let { value = $bindable(''), id }: { value: string; id: string } = $props();

	let conditions = $state<SearchCondition[]>(untrack(() => parseSearch(value)));
	let textMode = $state(false);
	let emitted = untrack(() => value);

	$effect(() => {
		const next = value;
		untrack(() => {
			if (next === emitted) return;
			emitted = next;
			conditions = parseSearch(next);
		});
	});

	function commit(next: SearchCondition[]) {
		conditions = next;
		emitted = formatSearch(next);
		value = emitted;
	}

	const update = (k: number, patch: Partial<SearchCondition>) =>
		commit(conditions.map((c, i) => (i === k ? { ...c, ...patch } : c)));

	const negateOptions = [
		{ value: 'is', label: 'is' },
		{ value: 'not', label: 'is not' }
	];
</script>

<div class="grid grid-cols-[minmax(0,1fr)] gap-2" role="group" aria-label="GitHub search">
	<div class="flex items-center justify-between gap-2">
		<span class="text-xs font-medium text-muted-foreground">Find on GitHub</span>
		{#if textMode}
			<Button variant="ghost" size="xs" onclick={() => (textMode = false)}
				><ListChecks /> Visual</Button
			>
		{:else}
			<Button variant="ghost" size="xs" onclick={() => (textMode = true)}><Code /> Text</Button>
		{/if}
	</div>

	{#if textMode}
		<Input
			{id}
			class="h-8 font-mono text-xs"
			spellcheck={false}
			aria-label="GitHub search query"
			{value}
			oninput={(e) => (value = e.currentTarget.value)}
		/>
	{:else}
		<div
			class="grid grid-cols-[minmax(0,1fr)] gap-2 sm:rounded-lg sm:border sm:border-dashed sm:p-2.5"
		>
			{#each conditions as c, k (k)}
				{@const field = searchField(c.key) ?? SEARCH_FIELDS[0]}
				<div
					class="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 sm:border-0 sm:bg-transparent sm:p-0"
				>
					<Select.Root
						type="single"
						value={c.key}
						onValueChange={(key) => update(k, { key, value: '', negate: false })}
					>
						<Select.Trigger size="sm" class="w-full sm:w-52" aria-label="Field"
							><span class="truncate">{field.label}</span></Select.Trigger
						>
						<Select.Content class="max-h-72">
							{#each SEARCH_FIELDS as f (f.key)}
								<Select.Item value={f.key} label={f.label} />
							{/each}
						</Select.Content>
					</Select.Root>
					{#if field.canNegate}
						<Select.Root
							type="single"
							value={c.negate ? 'not' : 'is'}
							onValueChange={(v) => update(k, { negate: v === 'not' })}
						>
							<Select.Trigger size="sm" class="w-22" aria-label="Is or is not"
								>{c.negate ? 'is not' : 'is'}</Select.Trigger
							>
							<Select.Content>
								{#each negateOptions as o (o.value)}
									<Select.Item value={o.value} label={o.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
					<div class="flex min-w-40 flex-1 items-center gap-1.5">
						{#if field.options}
							<Select.Root
								type="single"
								value={c.value}
								onValueChange={(v) => update(k, { value: v })}
							>
								<Select.Trigger size="sm" class="min-w-0 flex-1" aria-label={field.label}
									>{field.options.find((o) => o.value === c.value)?.label ??
										'Choose…'}</Select.Trigger
								>
								<Select.Content>
									{#each field.options as o (o.value)}
										<Select.Item value={o.value} label={o.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						{:else}
							<Input
								class={c.key === RAW_KEY
									? 'h-7 min-w-0 flex-1 font-mono text-xs'
									: 'h-7 min-w-0 flex-1'}
								placeholder={field.placeholder}
								aria-label={field.label}
								value={c.value}
								oninput={(e) => update(k, { value: e.currentTarget.value })}
							/>
						{/if}
						<button
							type="button"
							class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							aria-label="Remove condition"
							onclick={() => commit(conditions.filter((_, i) => i !== k))}
							><X class="size-3.5" /></button
						>
					</div>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">No conditions yet.</p>
			{/each}
			<div>
				<Button
					variant="outline"
					size="xs"
					onclick={() => commit([...conditions, { key: 'author', negate: false, value: '' }])}
					><Plus /> Condition</Button
				>
			</div>
		</div>
		<p class="text-xs text-muted-foreground">{describeSearch(conditions)}</p>
	{/if}
</div>
