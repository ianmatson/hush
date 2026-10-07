<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { peekQuery } from '$lib/queries';
	import { palette } from '$lib/palette.svelte';
	import { commandFor, keysOf } from '$lib/keys.svelte';
	import { acting, focusComposer, sendWithUndo } from '$lib/gh-act.svelte';
	import {
		GH_ACTIONS,
		MERGE_LABEL,
		ghActions,
		mainAction,
		type GhActionId
	} from '$lib/shared/actions';
	import { NO_STACK, stackMergeNotice, stackMergePlan } from '$lib/shared/stack-merge';
	import type { ActionKind, MergeMethod } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/**
	 * Actions on GitHub in the peek's bottom bar: the main one for what the thread asks of you, and
	 * the rest in "More" (shared/actions.ts). Comment is only the comment box at the end of the
	 * conversation, and request changes goes there too. Merge asks once more; close and auto-merge
	 * offer Undo. Keys: shared/keymap.ts.
	 */
	let { repo, number, need }: { repo: string; number: number; need: ActionKind | null } = $props();

	const q = createQuery(() => peekQuery(repo, number));
	const p = $derived(q.data);
	const states = $derived(p ? ghActions(p) : []);
	// Comment has no button here: the comment box at the end of the conversation is the one place
	// for it (its key and the palette still go there).
	const bar = $derived(states.filter((s) => s.id !== 'comment'));
	const main = $derived(mainAction(need, bar));
	const others = $derived(bar.filter((s) => s.id !== main?.id));
	const has = (id: GhActionId) => states.find((s) => s.id === id);

	const stackPlan = $derived(p ? stackMergePlan(p.number, p.can.pr?.stack ?? NO_STACK) : null);
	const stackNotice = $derived(stackPlan ? stackMergeNotice(stackPlan) : null);

	let method = $state<MergeMethod>('SQUASH');
	let mergeCommitPickedFor = '';
	$effect(() => {
		const m = p?.can.pr?.methods ?? [];
		const keepsStackedCommits = stackPlan?.kind === 'leaves_behind' && m.includes('MERGE');
		const pr = `${repo}#${number}`;
		untrack(() => {
			if (keepsStackedCommits && mergeCommitPickedFor !== pr) {
				mergeCommitPickedFor = pr;
				method = 'MERGE';
			} else if (m.length && !m.includes(method)) method = m[0];
		});
	});
	const label = (id: GhActionId) => (id === 'merge' ? MERGE_LABEL[method] : GH_ACTIONS[id].label);
	const hint = (id: GhActionId) => {
		const c = GH_ACTIONS[id].command;
		return c ? keysOf(c)[0] : undefined;
	};

	let confirming = $state<GhActionId | null>(null);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;

	/** Run an action from a button, the menu, a key, or the palette. */
	function run(id: GhActionId) {
		const s = has(id);
		if (!p || !s || acting.id) return;
		if (s.blocked) return void toast.error(s.blocked);
		if (id === 'comment' || id === 'request_changes') return focusComposer(id);
		if (GH_ACTIONS[id].confirm && confirming !== id) {
			confirming = id;
			if (id === 'merge' && stackNotice) toast.info(stackNotice, { duration: 8000 });
			clearTimeout(confirmTimer);
			confirmTimer = setTimeout(() => (confirming = null), 4000);
			return;
		}
		confirming = null;
		void sendWithUndo(p, id, { method });
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target;
		if (
			t instanceof Element &&
			t.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const cmd = commandFor(e, ['peek']);
		const s = cmd ? states.find((x) => GH_ACTIONS[x.id].command === cmd) : undefined;
		if (!s) return;
		e.preventDefault();
		run(s.id);
	}

	// The same actions in the command palette (⌘K).
	$effect(() =>
		palette.register(() =>
			states
				.filter((s) => !s.blocked)
				.map((s) => ({
					id: `gh:${s.id}`,
					label: label(s.id),
					detail: p ? `${p.repo}#${p.number}` : undefined,
					keywords: ['github', p?.kind === 'pr' ? 'pull request' : 'issue'],
					shortcut: hint(s.id),
					run: () => run(s.id)
				}))
		)
	);
</script>

<svelte:window onkeydown={onKey} />

{#snippet keyHint(id: GhActionId)}
	{#if hint(id)}<kbd class="ml-auto pl-3 font-sans text-xs text-muted-foreground">{hint(id)}</kbd
		>{/if}
{/snippet}

{#if p && bar.length}
	<div class="ml-auto flex items-center gap-1.5" role="group" aria-label="Actions on GitHub">
		{#if others.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="sm" variant="outline" disabled={!!acting.id}
							>More<ChevronDown class="opacity-60" /></Button
						>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" side="top" class="w-64">
					{#each others as s (s.id)}
						{#if s.blocked}
							<!-- Blocked: the reason in the item, not a tooltip (it works on touch too). -->
							<DropdownMenu.Item disabled class="items-start">
								<span class="grid gap-0.5">
									<span>{label(s.id)}</span>
									<span class="text-xs text-muted-foreground">{s.blocked}</span>
								</span>
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item
								class={cn(confirming === s.id && 'text-destructive')}
								onSelect={(e) => {
									// The first press of an action that asks again only arms it: the menu stays
									// open to show "Confirm: …". (Decide before run() changes `confirming`.)
									if (GH_ACTIONS[s.id].confirm && confirming !== s.id) e.preventDefault();
									run(s.id);
								}}
							>
								{confirming === s.id ? `Confirm: ${label(s.id).toLowerCase()}` : label(s.id)}
								{@render keyHint(s.id)}
							</DropdownMenu.Item>
						{/if}
					{/each}
					{#if has('approve') && !has('approve')?.blocked}
						<DropdownMenu.Item onSelect={() => focusComposer('approve')}
							>Approve with a comment…</DropdownMenu.Item
						>
					{/if}
					{#if (p.can.pr?.methods.length ?? 0) > 1 && (has('merge') || has('auto_merge'))}
						<DropdownMenu.Separator />
						<DropdownMenu.Label class="text-xs text-muted-foreground"
							>Merge method</DropdownMenu.Label
						>
						<DropdownMenu.RadioGroup bind:value={method}>
							{#each p.can.pr?.methods ?? [] as m (m)}
								<DropdownMenu.RadioItem value={m} closeOnSelect={false}
									>{MERGE_LABEL[m]}</DropdownMenu.RadioItem
								>
							{/each}
						</DropdownMenu.RadioGroup>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
		{#if main}
			<Button
				size="sm"
				variant={confirming === main.id ? 'destructive' : 'default'}
				disabled={!!acting.id}
				onclick={() => run(main.id)}
			>
				{#if acting.id === main.id}<LoaderCircle class="animate-spin" />{/if}
				{confirming === main.id ? `Confirm: ${label(main.id).toLowerCase()}` : label(main.id)}
			</Button>
		{/if}
	</div>
{/if}
