<script lang="ts">
	import { untrack, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, queryClient } from '$lib/queries';
	import { reportResolved } from '$lib/recheck';
	import { palette } from '$lib/palette.svelte';
	import {
		GH_ACTIONS,
		MERGE_LABEL,
		ghActions,
		keyLabel,
		mainAction,
		type GhActionId
	} from '$lib/shared/actions';
	import type { ActionKind, MergeMethod, PeekDTO } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	/**
	 * Actions on GitHub for the PR or issue in the peek: the main one for what the thread asks of
	 * you, the rest in "More", a comment box, and keys (shared/actions.ts has the table). Merge asks
	 * once more; approve waits 5 seconds (it cannot be withdrawn); close and auto-merge offer Undo.
	 */
	let { p, need }: { p: PeekDTO; need: ActionKind | null } = $props();

	const states = $derived(ghActions(p));
	const main = $derived(mainAction(need, states));
	const has = (id: GhActionId) => states.find((s) => s.id === id);
	let method = $state<MergeMethod>('SQUASH');
	$effect(() => {
		const m = p.can.pr?.methods ?? [];
		untrack(() => {
			if (!m.includes(method)) method = m[0] ?? 'SQUASH';
		});
	});
	const label = (id: GhActionId) => (id === 'merge' ? MERGE_LABEL[method] : GH_ACTIONS[id].label);

	let busy = $state<GhActionId | null>(null);
	let confirming = $state<GhActionId | null>(null);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	let composer = $state<'comment' | 'approve' | 'request_changes' | null>(null);
	let text = $state('');
	let box = $state<HTMLTextAreaElement | null>(null);

	async function send(id: GhActionId, body?: string): Promise<boolean> {
		busy = id;
		try {
			const res = await api.ghAction({
				repo: p.repo,
				number: p.number,
				action: id,
				body,
				method,
				sha: p.can.pr?.headOid,
				runs: p.can.pr?.failedRuns,
				id: p.can.id
			});
			reportResolved(res.resolved);
			for (const queryKey of [keys.peek(p.repo, p.number), keys.threadsAll, keys.dashAll])
				queryClient.invalidateQueries({ queryKey });
			return true;
		} catch (err) {
			toast.error(`${GH_ACTIONS[id].label}: ${(err as Error).message}`);
			return false;
		} finally {
			busy = null;
		}
	}

	async function done(id: GhActionId, body?: string) {
		if (!(await send(id, body))) return;
		const undo = GH_ACTIONS[id].undo;
		toast.success(GH_ACTIONS[id].done, {
			description: `${p.repo}#${p.number}`,
			...(undo && undo !== 'delay'
				? { action: { label: 'Undo', onClick: () => void done(undo) } }
				: {})
		});
	}

	/** Approve after 5 seconds, unless you press Undo: an approval cannot be withdrawn. */
	function approveLater(body?: string) {
		const at = `${p.repo}#${p.number}`;
		const timer = setTimeout(() => void done('approve', body), 5000);
		toast(`Approving ${at}…`, {
			duration: 5000,
			action: { label: 'Undo', onClick: () => clearTimeout(timer) }
		});
	}

	async function openComposer(mode: 'comment' | 'approve' | 'request_changes') {
		composer = mode;
		await tick();
		box?.focus();
	}

	/** Run an action from a button, the menu, a key, or the palette. */
	function run(id: GhActionId) {
		const s = has(id);
		if (!s || busy) return;
		if (s.blocked) return void toast.error(s.blocked);
		if (id === 'comment' || id === 'request_changes') return void openComposer(id);
		if (GH_ACTIONS[id].confirm && confirming !== id) {
			confirming = id;
			clearTimeout(confirmTimer);
			confirmTimer = setTimeout(() => (confirming = null), 4000);
			return;
		}
		confirming = null;
		if (id === 'approve') return approveLater();
		void done(id);
	}

	async function submit() {
		const body = text.trim();
		if (!composer || (composer !== 'approve' && !body)) return;
		const mode = composer;
		if (mode === 'approve') approveLater(body || undefined);
		else if (!(await send(mode, body))) return;
		else toast.success(GH_ACTIONS[mode].done, { description: `${p.repo}#${p.number}` });
		text = '';
		composer = null;
	}

	// Keys (shared/actions.ts), while the peek shows this PR or issue and you are not typing.
	function onKey(e: KeyboardEvent) {
		const t = e.target;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (
			t instanceof Element &&
			t.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const s = states.find((x) => GH_ACTIONS[x.id].key === e.key);
		if (!s) return;
		e.preventDefault();
		e.stopPropagation();
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
					detail: `${p.repo}#${p.number}`,
					keywords: ['github', p.kind === 'pr' ? 'pull request' : 'issue'],
					shortcut: GH_ACTIONS[s.id].key ? keyLabel(GH_ACTIONS[s.id].key!) : undefined,
					run: () => run(s.id)
				}))
		)
	);

	const others = $derived(states.filter((s) => s.id !== main?.id));
</script>

<svelte:window onkeydown={onKey} />

{#snippet keyHint(id: GhActionId)}
	{#if GH_ACTIONS[id].key}<kbd class="ml-auto pl-3 font-sans text-xs text-muted-foreground"
			>{keyLabel(GH_ACTIONS[id].key!)}</kbd
		>{/if}
{/snippet}

{#if states.length}
	<section class="grid gap-2" aria-label="Actions on GitHub">
		<div class="flex flex-wrap items-center gap-1.5">
			{#if main}
				<Button
					size="sm"
					variant={confirming === main.id ? 'destructive' : 'default'}
					disabled={!!busy}
					onclick={() => run(main.id)}
				>
					{#if busy === main.id}<LoaderCircle class="animate-spin" />{/if}
					{confirming === main.id ? `Confirm: ${label(main.id).toLowerCase()}` : label(main.id)}
				</Button>
			{/if}
			{#if others.length}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} size="sm" variant="outline" disabled={!!busy}
								>More<ChevronDown class="opacity-60" /></Button
							>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-64">
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
									closeOnSelect={!GH_ACTIONS[s.id].confirm || confirming === s.id}
									onSelect={() => run(s.id)}
								>
									{confirming === s.id ? `Confirm: ${label(s.id).toLowerCase()}` : label(s.id)}
									{@render keyHint(s.id)}
								</DropdownMenu.Item>
							{/if}
						{/each}
						{#if has('approve') && !has('approve')?.blocked}
							<DropdownMenu.Item onSelect={() => openComposer('approve')}
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
		</div>

		{#if composer}
			<form
				class="grid gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<Textarea
					bind:ref={box}
					bind:value={text}
					class="min-h-24 text-sm"
					placeholder={composer === 'approve'
						? 'Leave a comment with your approval (optional)'
						: composer === 'request_changes'
							? 'What should change?'
							: 'Leave a comment'}
					aria-label="Comment"
					onkeydown={(e) => {
						if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
							e.preventDefault();
							submit();
						} else if (e.key === 'Escape') {
							e.preventDefault();
							composer = null;
						}
					}}
				/>
				<div class="flex items-center gap-2">
					<Button
						type="submit"
						size="sm"
						variant={composer === 'request_changes' ? 'destructive' : 'default'}
						disabled={!!busy || (composer !== 'approve' && !text.trim())}
					>
						{#if busy}<LoaderCircle class="animate-spin" />{/if}
						{composer === 'approve'
							? 'Approve'
							: composer === 'request_changes'
								? 'Request changes'
								: 'Comment'}
					</Button>
					<Button type="button" size="sm" variant="ghost" onclick={() => (composer = null)}
						>Cancel</Button
					>
					<span class="ml-auto text-xs text-muted-foreground">⌘ Enter to send · Markdown</span>
				</div>
			</form>
		{/if}
	</section>
{/if}
