<script lang="ts">
	import { untrack } from 'svelte';
	import type { SavedView, Settings, ThreadDTO, ViewBase } from '$lib/shared/types';
	import { VIEW_BASES } from '$lib/shared/views';
	import { previewThreads, ruleSuggestions } from '$lib/rule-preview';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import RuleBuilder from './rules/rule-builder.svelte';

	/**
	 * Create or edit a notification view: a name, a base list, and conditions (the same as rules, also as
	 * text). Shows how many threads match while you edit.
	 */
	let {
		open = $bindable(false),
		initial,
		threads,
		me,
		settings,
		onsave,
		ondelete
	}: {
		open?: boolean;
		/** The view to edit, or the start of a new one (no id). */
		initial: Omit<SavedView, 'id'> & { id?: string };
		/** Threads of each base list the page has, for the live count. */
		threads: Partial<Record<ViewBase, ThreadDTO[]>>;
		me: string;
		settings?: Settings;
		onsave: (v: Omit<SavedView, 'id'> & { id?: string }) => Promise<void>;
		ondelete?: () => void;
	} = $props();

	let draft = $state<Omit<SavedView, 'id'> & { id?: string }>({
		name: '',
		base: 'inbox',
		query: ''
	});
	let saving = $state(false);
	async function save() {
		saving = true;
		try {
			await onsave($state.snapshot(draft));
		} finally {
			saving = false;
		}
	}

	// Start from `initial` each time the dialog opens.
	$effect(() => {
		if (open) untrack(() => (draft = structuredClone($state.snapshot(initial))));
	});

	const EXCLUDED_WORDS = ['in'];
	const list = $derived(threads[draft.base]);
	const suggestions = $derived(open ? ruleSuggestions(settings) : {});
	const nameOk = $derived(!!draft.name.trim());
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{initial.id ? 'Edit notification view' : 'New notification view'}</Dialog.Title>
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

		<RuleBuilder
			bind:value={draft.query}
			id="view-query"
			label="Only threads where"
			exclude={EXCLUDED_WORDS}
			{suggestions}
			preview={(q) => (list ? previewThreads(q, me, list, settings) : null)}
		/>
		{#if !list}
			<p class="text-xs text-muted-foreground">Hush counts the matches when it has this list.</p>
		{/if}

		<Dialog.Footer class="flex-row flex-wrap justify-end gap-2 sm:justify-between">
			{#if ondelete}
				<Button variant="ghost" class="text-destructive" onclick={ondelete}>Delete view</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button disabled={!nameOk || saving} onclick={save}>Save view</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
