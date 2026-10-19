<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { collapseSideways } from '$lib/reveal';
	import { createQuery } from '@tanstack/svelte-query';
	import { peekQuery } from '$lib/queries';
	import { palette } from '$lib/palette.svelte';
	import { commandFor, ignoreKey, keysOf } from '$lib/keys.svelte';
	import { acting, focusComposer, sendAction } from '$lib/gh-act.svelte';
	import { preferMergeMethod, preferredMerge } from '$lib/merge-method.svelte';
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

	let pickedHere = $state<{ pr: string; method: MergeMethod } | null>(null);
	const method = $derived.by((): MergeMethod => {
		const pr = `${repo}#${number}`;
		if (pickedHere?.pr === pr && methods.includes(pickedHere.method)) return pickedHere.method;
		const keepsStackedCommits = stackPlan?.kind === 'leaves_behind' && methods.includes('MERGE');
		if (keepsStackedCommits) return 'MERGE';
		const preferred = preferredMerge.method;
		return methods.length && !methods.includes(preferred) ? methods[0] : preferred;
	});
	function chooseMethod(m: MergeMethod) {
		pickedHere = { pr: `${repo}#${number}`, method: m };
		preferMergeMethod(m);
	}
	const label = (id: GhActionId) => (id === 'merge' ? MERGE_LABEL[method] : GH_ACTIONS[id].label);
	const hint = (id: GhActionId) => {
		const c = GH_ACTIONS[id].command;
		return c ? keysOf(c)[0] : undefined;
	};

	let mergeDialogOpen = $state(false);

	function run(id: GhActionId, when: 'ask' | 'now' = 'ask') {
		const s = has(id);
		if (!p || !s || acting.id) return;
		if (s.blocked) return void toast.error(s.blocked);
		if (id === 'comment' || id === 'request_changes') return focusComposer(id);
		if (GH_ACTIONS[id].confirm && when === 'ask') {
			mergeDialogOpen = true;
			return;
		}
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
			<span>{label(id)}</span>
			<span class="text-xs text-muted-foreground">{reason}</span>
		</span>
	</DropdownMenu.Item>
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
						{:else}
							<DropdownMenu.Item
								onSelect={() => run(s.id, s.id === 'merge' && stackNotice ? 'ask' : 'now')}
							>
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
					{#if methods.length > 1 && (has('merge') || has('auto_merge'))}
						<DropdownMenu.Separator />
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger>Merge method</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent
								class="w-52"
								side={noRoomForSubmenu.current ? 'top' : 'right'}
								align={noRoomForSubmenu.current ? 'end' : 'start'}
							>
								<DropdownMenu.RadioGroup bind:value={() => method, chooseMethod}>
									{#each methods as m (m)}
										<DropdownMenu.RadioItem value={m} closeOnSelect={false}
											>{MERGE_LABEL[m]}</DropdownMenu.RadioItem
										>
									{/each}
								</DropdownMenu.RadioGroup>
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
{/if}

{#if p}
	<MergeDialog
		bind:open={mergeDialogOpen}
		bind:method={() => method, chooseMethod}
		{p}
		notice={stackNotice}
		onconfirm={() => run('merge', 'now')}
	/>
{/if}
