<script lang="ts">
	import { untrack } from 'svelte';
	import type { SavedView, ThreadDTO, ViewBase } from '$lib/shared/types';
	import { RULE_FIELDS, type RuleField } from '$lib/shared/rule-fields';
	import { VIEW_BASES, threadMatches } from '$lib/shared/views';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import ConditionsEditor from './conditions-editor.svelte';
	import QueryInput from './query-input.svelte';

	/**
	 * Create or edit a saved view: a name, a base list, and conditions (the same as rules, also as
	 * text). Shows how many threads match while you edit.
	 */
	let {
		open = $bindable(false),
		initial,
		threads,
		me,
		suggest,
		onsave,
		ondelete
	}: {
		open?: boolean;
		/** The view to edit, or the start of a new one (no id). */
		initial: Omit<SavedView, 'id'> & { id?: string };
		/** Threads of each base list the page has, for the live count. */
		threads: Partial<Record<ViewBase, ThreadDTO[]>>;
		me: string;
		suggest: Partial<Record<RuleField, string[]>>;
		onsave: (v: Omit<SavedView, 'id'> & { id?: string }) => void;
		ondelete?: () => void;
	} = $props();

	let draft = $state<Omit<SavedView, 'id'> & { id?: string }>({
		name: '',
		base: 'inbox',
		when: {}
	});
	// Start from `initial` each time the dialog opens.
	$effect(() => {
		if (open) untrack(() => (draft = structuredClone($state.snapshot(initial))));
	});

	// "Category" is the base's job; "Hush's default" means little outside rules.
	const FIELDS = RULE_FIELDS.filter((f) => f.key !== 'category');
	const list = $derived(threads[draft.base]);
	const count = $derived(list?.filter((t) => threadMatches(draft.when, t, me)).length);
	const nameOk = $derived(!!draft.name.trim());
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{initial.id ? 'Edit view' : 'New view'}</Dialog.Title>
			<Dialog.Description
				>A tab with only the threads you choose. Actions and keys work as in its base.</Dialog.Description
			>
		</Dialog.Header>

		<div class="grid gap-1.5">
			<Label for="view-name">Name</Label>
			<Input id="view-name" placeholder="Docs PRs" maxlength={40} bind:value={draft.name} />
		</div>

		<div class="grid gap-1.5">
			<span class="text-sm font-medium">Show threads from</span>
			<div
				class="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5"
				role="radiogroup"
				aria-label="Base"
			>
				{#each VIEW_BASES as b (b.id)}
					<button
						type="button"
						role="radio"
						aria-checked={draft.base === b.id}
						class={cn(
							'rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
							draft.base === b.id && 'bg-background text-foreground shadow-xs'
						)}
						onclick={() => (draft.base = b.id)}>{b.label}</button
					>
				{/each}
			</div>
		</div>

		<ConditionsEditor
			bind:when={draft.when}
			fields={FIELDS}
			{suggest}
			idPrefix="view"
			title="Only threads where"
			emptyNote="No conditions: the view shows every thread of its base."
		/>
		<QueryInput bind:when={draft.when} id="view-query" />

		<p class="text-xs text-muted-foreground" aria-live="polite">
			{#if count !== undefined}
				<span class="font-medium text-foreground">{count}</span>
				{count === 1 ? 'thread matches' : 'threads match'} now.
			{:else}
				Hush counts the matches when it has this list.
			{/if}
		</p>

		<Dialog.Footer class="flex-row flex-wrap gap-2 sm:justify-between">
			{#if ondelete}
				<Button variant="ghost" class="text-destructive" onclick={ondelete}>Delete view</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button disabled={!nameOk} onclick={() => onsave($state.snapshot(draft))}>Save view</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
