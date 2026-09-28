<script lang="ts" module>
	import { keysOf } from '$lib/keys.svelte';
	import type { ActionKind } from '$lib/shared/types';

	export interface PeekTarget {
		/** PRs and issues have a number; other threads (releases, CI runs) cannot be peeked. */
		repo: string;
		number: number | null;
		title: string;
		url: string;
		/** What the thread asks of you: it picks the main action button. */
		need?: ActionKind | null;
	}
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ui } from '$lib/ui.svelte';
	import SidePanel from './side-panel.svelte';
	import PeekContent from './peek-content.svelte';
	import GhActions from './gh-actions.svelte';
	import { noteOpened } from '$lib/recheck';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	/**
	 * Read a PR or issue without leaving Hush (in the side panel). On wide screens the list stays
	 * usable, and the panel follows the keyboard cursor.
	 */
	let {
		target,
		onclose,
		footer
	}: {
		target: PeekTarget | null;
		onclose: () => void;
		/** Actions for the item (Done, Snooze…). */
		footer?: Snippet;
	} = $props();

	// The peek and the alert history share the right side: the one opened last stays.
	$effect(() => {
		if (target) untrack(() => (ui.alertsOpen = false));
	});
	$effect(() => {
		if (ui.alertsOpen && untrack(() => target)) onclose();
	});
</script>

<!-- The bottom bar: the page's own buttons (Done, Snooze…), then the actions on GitHub. -->
{#snippet bar()}
	{@render footer?.()}
	{#if target?.number}
		<GhActions repo={target.repo} number={target.number} need={target.need ?? null} />
	{/if}
{/snippet}

<SidePanel
	open={!!target}
	{onclose}
	label="peek"
	title={target?.title ?? 'Peek'}
	footer={footer || target?.number ? bar : undefined}
>
	{#snippet start(wide)}
		{#if wide}
			<span class="px-2 text-xs text-muted-foreground"
				><kbd class="font-sans">{keysOf('list.peek')[0] ?? ''}</kbd> to close ·
				<kbd class="font-sans">{keysOf('list.next')[0] ?? ''}</kbd>/<kbd class="font-sans"
					>{keysOf('list.prev')[0] ?? ''}</kbd
				> to move</span
			>
		{/if}
	{/snippet}
	{#snippet actions(size)}
		{#if target}
			<Button
				variant="ghost"
				{size}
				href={target.url}
				onclick={() => target && noteOpened(target.url)}
				target="_blank"
				rel="noreferrer"
				aria-label="Open on GitHub"><ExternalLink /></Button
			>
		{/if}
	{/snippet}
	{#if target}<PeekContent repo={target.repo} number={target.number} title={target.title} />{/if}
</SidePanel>
