<script lang="ts" module>
	export interface RulePreview {
		matches: number;
		examples: { title: string; repo: string; lane: string }[];
	}
</script>

<script lang="ts">
	import type { Rule } from '$lib/shared/types';
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

	/** One rule: a query (when), and what it does (then). Settings → Advanced. */
	let {
		rule = $bindable(),
		index,
		count,
		preview,
		onmove,
		onduplicate,
		onremove
	}: {
		rule: Rule;
		index: number;
		count: number;
		preview?: RulePreview;
		onmove: (to: number) => void;
		onduplicate: () => void;
		onremove: () => void;
	} = $props();

	type Then = Rule['then'];
	type Put = 'turn' | 'updates' | 'mute' | null;
	function setThen(patch: { put?: Put; push?: boolean | null; snoozeHours?: number | null }) {
		const then: Then = { ...rule.then };
		if (patch.put !== undefined) {
			delete then.lane;
			delete then.mute;
			if (patch.put === 'mute') then.mute = true;
			else if (patch.put) then.lane = patch.put;
		}
		if (patch.push !== undefined) {
			if (patch.push === null) delete then.push;
			else then.push = patch.push;
		}
		if (patch.snoozeHours !== undefined) {
			if (patch.snoozeHours === null) delete then.snoozeHours;
			else then.snoozeHours = patch.snoozeHours;
		}
		rule = { ...rule, then };
	}
	const put = $derived<Put>(rule.then.mute ? 'mute' : (rule.then.lane ?? null));

	const PUT: { value: Put; label: string }[] = [
		{ value: null, label: 'No change' },
		{ value: 'turn', label: 'Your turn' },
		{ value: 'updates', label: 'Updates' },
		{ value: 'mute', label: 'Mute (hide)' }
	];
	const PUSH: { value: boolean | null; label: string }[] = [
		{ value: null, label: 'No change' },
		{ value: true, label: 'Always' },
		{ value: false, label: 'Never' }
	];
	const SNOOZE: { value: number | null; label: string }[] = [
		{ value: null, label: 'No' },
		{ value: 1, label: '1 hour' },
		{ value: 4, label: '4 hours' },
		{ value: 24, label: '1 day' },
		{ value: 72, label: '3 days' },
		{ value: 168, label: '1 week' }
	];
	const noResult = $derived(
		rule.then.lane === undefined &&
			rule.then.push === undefined &&
			rule.then.mute === undefined &&
			rule.then.snoozeHours === undefined
	);
	const LANE_LABEL: Record<string, string> = {
		turn: 'Your turn',
		waiting: 'Waiting',
		updates: 'Updates',
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

	<QueryInput
		bind:value={() => rule.when ?? '', (when) => (rule = { ...rule, when })}
		id="rule-{index}-query"
		label="When (a query; empty matches every item)"
	/>

	<section class="grid gap-2">
		<h3 class="text-xs font-medium text-muted-foreground">Then</h3>
		<div class="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-3">
			<span class="text-sm">Put it in</span>
			{@render segmented(PUT, put, (v) => setThen({ put: v }), 'Put it in')}
			<span class="text-sm">Push</span>
			{@render segmented(PUSH, rule.then.push ?? null, (v) => setThen({ push: v }), 'Push')}
			<span class="text-sm">Snooze it</span>
			{@render segmented(
				SNOOZE,
				rule.then.snoozeHours ?? null,
				(v) => setThen({ snoozeHours: v }),
				'Snooze it when it comes into Your turn'
			)}
		</div>
		{#if rule.then.snoozeHours}
			<p class="text-xs text-muted-foreground">
				When it comes into Your turn. If you move it back yourself, it stays.
			</p>
		{/if}
		{#if noResult}
			<p class="flex items-center gap-1.5 text-xs text-destructive">
				<TriangleAlert class="size-3.5" />Choose where it goes, a push setting, or a snooze.
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
					{preview.matches === 1 ? 'item' : 'items'}. For example:
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
							<span class="shrink-0">→ {LANE_LABEL[ex.lane] ?? ex.lane}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p>
					Catches no item now{index > 0 ? ' (or a rule above catches them first)' : ''}.
				</p>
			{/if}
		</footer>
	{/if}
</article>
