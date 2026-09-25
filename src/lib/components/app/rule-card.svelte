<script lang="ts" module>
	export interface RulePreview {
		matches: number;
		inInbox: number;
		examples: { title: string; repo: string; category: string }[];
	}
</script>

<script lang="ts">
	import type { Category, Rule, RuleMatch } from '$lib/shared/types';
	import { RULE_FIELDS, asList, fieldInfo, type RuleField } from '$lib/shared/rule-fields';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	/** One rule in the visual rule editor (Settings → Inbox). */
	let {
		rule = $bindable(),
		index,
		count,
		preview,
		suggest,
		onmove,
		onduplicate,
		onremove
	}: {
		rule: Rule;
		index: number;
		count: number;
		preview?: RulePreview;
		/** Values to suggest for text conditions (repos and authors you get notifications from). */
		suggest: Partial<Record<RuleField, string[]>>;
		onmove: (to: number) => void;
		onduplicate: () => void;
		onremove: () => void;
	} = $props();

	const conditions = $derived(Object.keys(rule.when ?? {}) as RuleField[]);
	const unused = $derived(RULE_FIELDS.filter((f) => !conditions.includes(f.key)));
	const id = $derived(`rule-${index}`);

	function setWhen(key: RuleField, value: unknown) {
		const when: RuleMatch = { ...rule.when };
		if (value === undefined) delete when[key];
		else (when as Record<string, unknown>)[key] = value;
		rule = { ...rule, when };
	}
	function addCondition(key: RuleField) {
		const f = fieldInfo(key)!;
		setWhen(key, f.input === 'yesno' ? true : f.input === 'text' ? '' : []);
	}
	/** Repo and author: one glob is stored as a string (the form people write by hand). */
	const setList = (key: RuleField, list: string[]) =>
		setWhen(key, (key === 'repo' || key === 'author') && list.length === 1 ? list[0] : list);

	function setThen(patch: { category?: Category | null; push?: boolean | null }) {
		const then = { ...rule.then };
		if (patch.category !== undefined) {
			if (patch.category === null) delete then.category;
			else then.category = patch.category;
		}
		if (patch.push !== undefined) {
			if (patch.push === null) delete then.push;
			else then.push = patch.push;
		}
		rule = { ...rule, then };
	}

	let drafts = $state<Record<string, string>>({});
	function addValue(key: RuleField) {
		const v = (drafts[key] ?? '').trim();
		if (!v) return;
		const list = asList(rule.when[key]);
		if (!list.includes(v)) setList(key, [...list, v]);
		drafts[key] = '';
	}

	const CATEGORIES: { value: Category | null; label: string }[] = [
		{ value: null, label: 'No change' },
		{ value: 'action', label: 'Needs you' },
		{ value: 'fyi', label: 'FYI' },
		{ value: 'muted', label: 'Muted' }
	];
	const PUSH: { value: boolean | null; label: string }[] = [
		{ value: null, label: 'No change' },
		{ value: true, label: 'Always' },
		{ value: false, label: 'Never' }
	];
	const noResult = $derived(rule.then.category === undefined && rule.then.push === undefined);
	const CATEGORY_LABEL: Record<string, string> = {
		action: 'Needs you',
		fyi: 'FYI',
		muted: 'Muted'
	};
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

<article
	class={cn(
		'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-xl border p-3 sm:p-4',
		rule.enabled === false && 'opacity-60'
	)}
	aria-label="Rule {index + 1}"
>
	<header class="flex items-center gap-2">
		<span class="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums"
			>{index + 1}</span
		>
		<Switch
			checked={rule.enabled !== false}
			onCheckedChange={(on) => (rule = { ...rule, enabled: on ? undefined : false })}
			aria-label="Rule on"
		/>
		<Input
			class="h-8 min-w-0 flex-1"
			placeholder="Rule {index + 1}"
			aria-label="Rule name"
			value={rule.name ?? ''}
			oninput={(e) => (rule = { ...rule, name: e.currentTarget.value || undefined })}
		/>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Move up"
			disabled={index === 0}
			onclick={() => onmove(index - 1)}><ChevronUp /></Button
		>
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Move down"
			disabled={index === count - 1}
			onclick={() => onmove(index + 1)}><ChevronDown /></Button
		>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon-sm" aria-label="Rule actions"
						><Ellipsis /></Button
					>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={onduplicate}><Copy />Duplicate</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onclick={onremove}
					><Trash />Delete</DropdownMenu.Item
				>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</header>

	<section class="grid gap-2">
		<h3 class="text-xs font-medium text-muted-foreground">
			When {conditions.length > 1 ? 'all of these match' : ''}
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
						{@const picked = asList(rule.when[key])}
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
						{@const list = asList(rule.when[key])}
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
								list="{id}-{key}"
								placeholder={list.length
									? 'Add another…'
									: key === 'repo'
										? 'PostHog/*'
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
								<datalist id="{id}-{key}">
									{#each suggest[key] ?? [] as s (s)}<option value={s}></option>{/each}
								</datalist>
							{/if}
						</div>
					{:else if f.input === 'text'}
						<Input
							class="h-8 bg-background"
							placeholder="Text in the title"
							value={String(rule.when[key] ?? '')}
							oninput={(e) => setWhen(key, e.currentTarget.value)}
						/>
					{:else}
						{@render segmented(
							[
								{ value: true, label: f.yes! },
								{ value: false, label: f.no! }
							],
							rule.when[key] as boolean,
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
				<TriangleAlert class="size-3.5" />No conditions: this rule matches every thread.
			</p>
		{/if}
		{#if unused.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							size="sm"
							class="h-7 justify-self-start font-normal"><Plus />Add condition</Button
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
	</section>

	<section class="grid gap-2">
		<h3 class="text-xs font-medium text-muted-foreground">Then</h3>
		<div class="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-3">
			<span class="text-sm">Put it in</span>
			{@render segmented(
				CATEGORIES,
				rule.then.category ?? null,
				(v) => setThen({ category: v }),
				'Put it in'
			)}
			<span class="text-sm">Push</span>
			{@render segmented(PUSH, rule.then.push ?? null, (v) => setThen({ push: v }), 'Push')}
		</div>
		{#if noResult}
			<p class="flex items-center gap-1.5 text-xs text-destructive">
				<TriangleAlert class="size-3.5" />Choose where it goes, or a push setting.
			</p>
		{/if}
	</section>

	{#if preview}
		<footer class="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
			{#if rule.enabled === false}
				<p>Off. It catches nothing until you turn it on.</p>
			{:else if preview.matches}
				<p>
					Catches <span class="font-medium text-foreground">{preview.matches}</span>
					{preview.matches === 1 ? 'thread' : 'threads'}{#if preview.inInbox}, {preview.inInbox}
						in your inbox{/if}. For example:
				</p>
				<ul class="grid gap-0.5">
					{#each preview.examples as ex, k (k)}
						<li
							class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
						>
							<span class="truncate">{ex.title}</span>
							<span class="hidden max-w-40 truncate font-mono text-[0.7rem] opacity-70 sm:block"
								>{ex.repo}</span
							>
							<span class="shrink-0">→ {CATEGORY_LABEL[ex.category] ?? ex.category}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p>
					Catches no stored thread now{index > 0 ? ' (or a rule above catches them first)' : ''}.
				</p>
			{/if}
		</footer>
	{/if}
</article>
