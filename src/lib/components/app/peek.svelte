<script lang="ts" module>
	import { keysOf } from '$lib/keys.svelte';
	import type { ActionKind } from '$lib/shared/types';

	export interface PeekTarget {
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
	import { smoothHeight } from '$lib/smooth-height';
	import { itemPagePathFromGitHubUrl } from '$lib/shared/item-page';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Tip from './tip.svelte';

	/**
	 * Read a PR or issue without leaving Hush (in the side panel). On wide screens the list stays
	 * usable, and the panel follows the keyboard cursor.
	 */
	let {
		target,
		onclose,
		header,
		footer
	}: {
		target: PeekTarget | null;
		onclose: () => void;
		/** Why the item is in its list. */
		header?: Snippet;
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

	let closingTarget = $state<PeekTarget | null>(null);
	$effect.pre(() => {
		if (target) closingTarget = target;
	});
	const shown = $derived(target ?? closingTarget);

	const fullPagePath = $derived(shown?.number ? itemPagePathFromGitHubUrl(shown.url) : null);
</script>

<!-- The bottom bar: the page's own buttons (Done, Snooze…), then the actions on GitHub. -->
{#snippet bar()}
	{@render footer?.()}
	{#if shown?.number}
		<div class="ml-auto">
			<GhActions repo={shown.repo} number={shown.number} need={shown.need ?? null} />
		</div>
	{/if}
{/snippet}

<SidePanel
	open={!!target}
	{onclose}
	onclosecomplete={() => {
		if (!target) closingTarget = null;
	}}
	label="peek"
	title={shown?.title ?? 'Peek'}
	contentKey={shown ? `${shown.repo}#${shown.number}` : undefined}
	footer={footer || shown?.number ? bar : undefined}
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
		{#if fullPagePath}
			<Tip text="Open full page ({keysOf('list.fullPage')[0] ?? ''})">
				{#snippet children(props)}
					<Button {...props} variant="ghost" {size} href={fullPagePath} aria-label="Open full page"
						><Maximize2 /></Button
					>
				{/snippet}
			</Tip>
		{/if}
		{#if shown}
			{@const url = shown.url}
			<Tip text="Open on GitHub ({keysOf('list.openGitHub')[0] ?? ''})">
				{#snippet children(props)}
					<Button
						{...props}
						variant="ghost"
						{size}
						href={url}
						onclick={(e: MouseEvent) => {
							(props.onclick as ((e: MouseEvent) => void) | undefined)?.(e);
							noteOpened(url);
						}}
						target="_blank"
						rel="noreferrer"
						aria-label="Open on GitHub"><ExternalLink /></Button
					>
				{/snippet}
			</Tip>
		{/if}
	{/snippet}
	{#if shown}
		{#if header}
			<div class="overflow-hidden" {@attach smoothHeight}>
				<div>{@render header()}</div>
			</div>
		{/if}
		<PeekContent repo={shown.repo} number={shown.number} title={shown.title} />
	{/if}
</SidePanel>
