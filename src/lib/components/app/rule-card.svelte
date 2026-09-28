<script lang="ts" module>
	export interface RulePreview {
		matches: number;
		inInbox: number;
		examples: { title: string; repo: string; category: string }[];
	}
</script>

<script lang="ts">
	import type { Category, Rule } from '$lib/shared/types';
	import { RULE_FIELDS, type RuleField } from '$lib/shared/rule-fields';
	import ConditionsEditor from './conditions-editor.svelte';
	import QueryInput from './query-input.svelte';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
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

	type Triage = NonNullable<Rule['then']['triage']>;
	function setThen(patch: {
		category?: Category | null;
		push?: boolean | null;
		triage?: Triage | null;
		snoozeHours?: number;
	}) {
		const then = { ...rule.then };
		if (patch.category !== undefined) {
			if (patch.category === null) delete then.category;
			else then.category = patch.category;
		}
		if (patch.push !== undefined) {
			if (patch.push === null) delete then.push;
			else then.push = patch.push;
		}
		if (patch.triage !== undefined) {
			if (patch.triage === null) delete then.triage;
			else then.triage = patch.triage;
			if (patch.triage === 'snooze') then.snoozeHours ??= 24;
			else delete then.snoozeHours;
		}
		if (patch.snoozeHours !== undefined) then.snoozeHours = patch.snoozeHours;
		rule = { ...rule, then };
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
	const TRIAGE: { value: Triage | null; label: string }[] = [
		{ value: null, label: 'No change' },
		{ value: 'done', label: 'Move to Done' },
		{ value: 'snooze', label: 'Snooze' }
	];
	const SNOOZE_HOURS: { value: number; label: string }[] = [
		{ value: 1, label: '1 hour' },
		{ value: 4, label: '4 hours' },
		{ value: 24, label: '1 day' },
		{ value: 72, label: '3 days' },
		{ value: 168, label: '1 week' }
	];
	const noResult = $derived(
		rule.then.category === undefined &&
			rule.then.push === undefined &&
			rule.then.triage === undefined
	);
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

	<ConditionsEditor
		bind:when={() => rule.when ?? {}, (when) => (rule = { ...rule, when })}
		fields={RULE_FIELDS}
		{suggest}
		idPrefix="rule-{index}"
		emptyNote="No conditions: this rule matches every thread."
	/>
	<QueryInput
		bind:when={() => rule.when ?? {}, (when) => (rule = { ...rule, when })}
		id="rule-{index}-query"
	/>

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
			<span class="text-sm">Also</span>
			{@render segmented(TRIAGE, rule.then.triage ?? null, (v) => setThen({ triage: v }), 'Also')}
			{#if rule.then.triage === 'snooze'}
				<span class="text-sm">For</span>
				{@render segmented(
					SNOOZE_HOURS,
					rule.then.snoozeHours ?? 24,
					(v) => setThen({ snoozeHours: v }),
					'Snooze for'
				)}
			{/if}
		</div>
		{#if rule.then.triage}
			<p class="text-xs text-muted-foreground">
				When the rule starts to match a thread in your inbox. If you move the thread back, it stays.
			</p>
		{/if}
		{#if noResult}
			<p class="flex items-center gap-1.5 text-xs text-destructive">
				<TriangleAlert class="size-3.5" />Choose where it goes, a push setting, or a move.
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
