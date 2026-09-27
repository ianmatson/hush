<script lang="ts">
	import type { RuleMatch } from '$lib/shared/types';
	import { asList, type RuleField, type RuleFieldInfo } from '$lib/shared/rule-fields';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	/**
	 * Conditions that must all match: the "When" of a rule, and the filter of a saved view. The
	 * same fields and meaning in both (see shared/rule-fields.ts).
	 */
	let {
		when = $bindable(),
		fields,
		suggest = {},
		idPrefix,
		title = 'When',
		emptyNote
	}: {
		when: RuleMatch;
		fields: RuleFieldInfo[];
		/** Values to suggest for text conditions (repos and authors you get notifications from). */
		suggest?: Partial<Record<RuleField, string[]>>;
		/** Unique per editor on the page (for suggestion lists). */
		idPrefix: string;
		title?: string;
		/** Shown when there are no conditions. */
		emptyNote: string;
	} = $props();

	const fieldInfo = (key: string) => fields.find((f) => f.key === key);
	const conditions = $derived((Object.keys(when ?? {}) as RuleField[]).filter((k) => fieldInfo(k)));
	const unused = $derived(fields.filter((f) => !conditions.includes(f.key)));

	function setWhen(key: RuleField, value: unknown) {
		const next: RuleMatch = { ...when };
		if (value === undefined) delete next[key];
		else (next as Record<string, unknown>)[key] = value;
		when = next;
	}
	function addCondition(key: RuleField) {
		const f = fieldInfo(key)!;
		setWhen(key, f.input === 'yesno' ? true : f.input === 'text' ? '' : []);
	}
	/** Repo and author: one glob is stored as a string (the form people write by hand). */
	const setList = (key: RuleField, list: string[]) =>
		setWhen(key, (key === 'repo' || key === 'author') && list.length === 1 ? list[0] : list);

	let drafts = $state<Record<string, string>>({});
	function addValue(key: RuleField) {
		const v = (drafts[key] ?? '').trim();
		if (!v) return;
		const list = asList(when[key]);
		if (!list.includes(v)) setList(key, [...list, v]);
		drafts[key] = '';
	}
</script>

{#snippet segmented<T>(
	options: { value: T; label: string }[],
	current: T,
	onpick: (v: T) => void,
	label: string
)}
	<div
		class="flex flex-wrap gap-1 justify-self-start rounded-lg bg-muted p-0.5"
		role="radiogroup"
		aria-label={label}
	>
		{#each options as o (o.label)}
			<button
				type="button"
				role="radio"
				aria-checked={current === o.value}
				class={cn(
					'rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
					current === o.value && 'bg-background text-foreground shadow-xs'
				)}
				onclick={() => onpick(o.value)}>{o.label}</button
			>
		{/each}
	</div>
{/snippet}

<div class="grid gap-2">
	<h3 class="text-xs font-medium text-muted-foreground">
		{title}{conditions.length > 1 ? ' all of these match' : ''}
	</h3>
	{#each conditions as key (key)}
		{@const f = fieldInfo(key)}
		{#if f}
			<div class="grid gap-1.5 rounded-lg bg-muted/40 p-2.5">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">{f.label}</span>
					<Button
						variant="ghost"
						size="icon-xs"
						class="ml-auto"
						aria-label="Remove condition {f.label}"
						onclick={() => setWhen(key, undefined)}><X /></Button
					>
				</div>
				{#if f.input === 'options'}
					{@const picked = asList(when[key])}
					<div class="flex flex-wrap gap-1">
						{#each f.options ?? [] as o (o.value)}
							{@const on = picked.includes(o.value)}
							<button
								type="button"
								aria-pressed={on}
								class={cn(
									'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
									on
										? 'border-primary bg-primary text-primary-foreground'
										: 'bg-background text-muted-foreground hover:text-foreground'
								)}
								onclick={() =>
									setList(key, on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
								>{o.label}</button
							>
						{/each}
					</div>
				{:else if f.input === 'globs'}
					{@const list = asList(when[key])}
					<div class="flex flex-wrap items-center gap-1">
						{#each list as v (v)}
							<span
								class="flex items-center gap-0.5 rounded-full border bg-background py-0.5 pr-0.5 pl-2 font-mono text-xs"
								>{v}<button
									type="button"
									class="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label="Remove {v}"
									onclick={() =>
										setList(
											key,
											list.filter((x) => x !== v)
										)}><X class="size-3" /></button
								></span
							>
						{/each}
						<input
							class="h-7 min-w-32 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							list="{idPrefix}-{key}"
							placeholder={list.length
								? 'Add another…'
								: key === 'repo'
									? 'acme/*'
									: 'Type, then Enter'}
							aria-label="Add {f.label}"
							bind:value={drafts[key]}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ',') {
									e.preventDefault();
									addValue(key);
								}
							}}
							onblur={() => addValue(key)}
						/>
						{#if suggest[key]?.length}
							<datalist id="{idPrefix}-{key}">
								{#each suggest[key] ?? [] as s (s)}<option value={s}></option>{/each}
							</datalist>
						{/if}
					</div>
				{:else if f.input === 'text'}
					<Input
						class="h-8 bg-background"
						placeholder="Text in the title"
						value={String(when[key] ?? '')}
						oninput={(e) => setWhen(key, e.currentTarget.value)}
					/>
				{:else}
					{@render segmented(
						[
							{ value: true, label: f.yes! },
							{ value: false, label: f.no! }
						],
						when[key] as boolean,
						(v) => setWhen(key, v),
						f.label
					)}
				{/if}
				{#if f.help}<p class="text-xs text-muted-foreground">{f.help}</p>{/if}
			</div>
		{/if}
	{/each}
	{#if !conditions.length}
		<p class="flex items-center gap-1.5 text-xs text-signal-warn">
			<TriangleAlert class="size-3.5" />{emptyNote}
		</p>
	{/if}
	{#if unused.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm" class="h-7 justify-self-start font-normal"
						><Plus />Add condition</Button
					>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-60">
				{#each unused as f (f.key)}
					<DropdownMenu.Item onclick={() => addCondition(f.key)}>{f.label}</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>
