<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { collapseSideways } from '$lib/reveal';
	import { createQuery } from '@tanstack/svelte-query';
	import { peekQuery } from '$lib/queries';
	import { palette } from '$lib/palette.svelte';
	import { commandFor, ignoreKey, keysOf } from '$lib/keys.svelte';
	import { acting, focusComposer, sendAction } from '$lib/gh-act.svelte';
	import {
		GH_ACTIONS,
		MERGE_LABEL,
		ghActions,
		mainAction,
		type GhActionId
	} from '$lib/shared/actions';
	import { NO_STACK, stackMergeNotice, stackMergePlan } from '$lib/shared/stack-merge';
	import type { ActionKind, MergeMethod } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import MergeDialog from './merge-dialog.svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let {
		repo,
		number,
		need,
		moreAsIcon = false
	}: { repo: string; number: number; need: ActionKind | null; moreAsIcon?: boolean } = $props();

	const METHOD_ACTIONS = new Set<GhActionId>(['merge', 'auto_merge']);
	const noRoomForSubmenu = new MediaQuery('max-width: 639px');

	const q = createQuery(() => peekQuery(repo, number));
	const p = $derived(q.data);
	const states = $derived(p ? ghActions(p) : []);
	// Comment has no button here: the comment box at the end of the conversation is the one place
	// for it (its key and the palette still go there).
	const bar = $derived(states.filter((s) => s.id !== 'comment'));
	const main = $derived(mainAction(need, bar));
	const others = $derived(bar.filter((s) => s.id !== main?.id));
	const has = (id: GhActionId) => states.find((s) => s.id === id);
	const canApproveWithComment = $derived(!!has('approve') && !has('approve')?.blocked);
	const methods = $derived(p?.can.pr?.methods ?? []);

	const stackPlan = $derived(p ? stackMergePlan(p.number, p.can.pr?.stack ?? NO_STACK) : null);
	const stackNotice = $derived(stackPlan ? stackMergeNotice(stackPlan) : null);

	let method = $state<MergeMethod>('SQUASH');
	let mergeCommitPickedFor = '';
	$effect(() => {
		const m = methods;
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

	let mergeDialogOpen = $state(false);

	function run(id: GhActionId, chosen: MergeMethod | 'ask' = 'ask') {
		const s = has(id);
		if (!p || !s || acting.id) return;
		if (s.blocked) return void toast.error(s.blocked);
		if (id === 'comment' || id === 'request_changes') return focusComposer(id);
		if (GH_ACTIONS[id].confirm && chosen === 'ask') {
			mergeDialogOpen = true;
			return;
		}
		if (chosen !== 'ask') method = chosen;
		void sendAction(p, id, { method });
	}

	function onKey(e: KeyboardEvent) {
		if (ignoreKey(e)) return;
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

{#snippet blockedItem(id: GhActionId, reason: string)}
	<!-- Blocked: the reason in the item, not a tooltip (it works on touch too). -->
	<DropdownMenu.Item disabled class="items-start">
		<span class="grid gap-0.5">
			<span>{GH_ACTIONS[id].label}</span>
			<span class="text-xs text-muted-foreground">{reason}</span>
		</span>
	</DropdownMenu.Item>
{/snippet}

{#snippet methodItems(id: GhActionId)}
	{#if id === 'merge' && stackNotice}
		<DropdownMenu.Label class="max-w-64 text-xs font-normal text-muted-foreground"
			>{stackNotice}</DropdownMenu.Label
		>
		<DropdownMenu.Separator />
	{/if}
	{#each methods as m (m)}
		<DropdownMenu.Item onSelect={() => run(id, m)}>{MERGE_LABEL[m]}</DropdownMenu.Item>
	{/each}
{/snippet}

{#if p && bar.length}
	<div
		class="flex items-center gap-1.5"
		role="group"
		aria-label="Actions on GitHub"
		transition:collapseSideways
	>
		{#if main}
			<Button size="sm" disabled={!!acting.id} onclick={() => run(main.id)}>
				{#if acting.id === main.id}<LoaderCircle class="animate-spin" />{/if}
				{label(main.id)}
			</Button>
		{/if}
		{#if others.length || canApproveWithComment}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						{#if moreAsIcon}
							<Button
								{...props}
								size="icon-sm"
								variant="ghost"
								aria-label="More actions"
								disabled={!!acting.id}><Ellipsis /></Button
							>
						{:else}
							<Button {...props} size="sm" variant="outline" disabled={!!acting.id}
								>More<ChevronDown class="opacity-60" /></Button
							>
						{/if}
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" side="top" class="w-64">
					{#each others as s (s.id)}
						{#if s.blocked}
							{@render blockedItem(s.id, s.blocked)}
						{:else if METHOD_ACTIONS.has(s.id) && methods.length > 1}
							<DropdownMenu.Sub>
								<DropdownMenu.SubTrigger>{GH_ACTIONS[s.id].label}</DropdownMenu.SubTrigger>
								<DropdownMenu.SubContent
									class="w-52"
									side={noRoomForSubmenu.current ? 'top' : 'right'}
									align={noRoomForSubmenu.current ? 'end' : 'start'}
								>
									{@render methodItems(s.id)}
								</DropdownMenu.SubContent>
							</DropdownMenu.Sub>
						{:else}
							<DropdownMenu.Item onSelect={() => run(s.id, method)}>
								{label(s.id)}
								{@render keyHint(s.id)}
							</DropdownMenu.Item>
						{/if}
					{/each}
					{#if canApproveWithComment}
						<DropdownMenu.Item onSelect={() => focusComposer('approve')}
							>Approve with a comment…</DropdownMenu.Item
						>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
{/if}

{#if p}
	<MergeDialog
		bind:open={mergeDialogOpen}
		bind:method
		{p}
		notice={stackNotice}
		onconfirm={() => run('merge', method)}
	/>
{/if}
