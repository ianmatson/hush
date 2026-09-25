<script lang="ts" module>
	export interface PeekTarget {
		/** PRs and issues have a number; other threads (releases, CI runs) cannot be peeked. */
		repo: string;
		number: number | null;
		title: string;
		url: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { ui } from '$lib/ui.svelte';
	import PeekBody from './peek-body.svelte';
	import { noteOpened } from '$lib/recheck';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	/**
	 * Read a PR or issue without leaving Hush. Wide screens: a panel docked on the right; the list
	 * stays usable, and the panel follows the keyboard cursor. Narrow screens: a bottom sheet.
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

	const wide = new MediaQuery('min-width: 1024px');
	const docked = $derived(!!target && wide.current);

	$effect(() => {
		ui.peekDocked = docked;
		document.documentElement.classList.toggle('peek-docked', docked);
	});
	$effect(() => () => {
		ui.peekDocked = false;
		document.documentElement.classList.remove('peek-docked');
	});
</script>

{#snippet content(t: PeekTarget)}
	{#if t.number}
		{#key `${t.repo}#${t.number}`}
			<PeekBody repo={t.repo} number={t.number} />
		{/key}
	{:else}
		<div class="grid gap-2 p-4 text-sm">
			<p class="font-mono text-xs text-muted-foreground">{t.repo}</p>
			<h2 class="text-base font-semibold">{t.title}</h2>
			<p class="text-muted-foreground">Hush can show only pull requests and issues.</p>
		</div>
	{/if}
{/snippet}

{#if target && wide.current}
	<aside
		class="fixed top-12 right-0 bottom-0 z-20 flex w-(--peek-w) flex-col border-l bg-background shadow-[-12px_0_32px_-24px_rgb(0_0_0/0.25)]"
		aria-label="Peek"
		transition:fly={{ x: 40, duration: 200, easing: cubicOut }}
	>
		<div class="flex h-11 shrink-0 items-center gap-1 border-b px-2">
			<span class="px-2 text-xs text-muted-foreground"
				><kbd class="font-sans">Space</kbd> to close · <kbd class="font-sans">J</kbd>/<kbd
					class="font-sans">K</kbd
				> to move</span
			>
			<Button
				variant="ghost"
				size="icon-sm"
				class="ml-auto"
				href={target.url}
				onclick={() => target && noteOpened(target.url)}
				target="_blank"
				rel="noreferrer"
				aria-label="Open on GitHub"><ExternalLink /></Button
			>
			<Button variant="ghost" size="icon-sm" aria-label="Close peek" onclick={onclose}><X /></Button
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			{@render content(target)}
		</div>
		{#if footer}
			<div class="flex shrink-0 flex-wrap items-center gap-1 border-t p-2">{@render footer()}</div>
		{/if}
	</aside>
{:else}
	<Dialog.Root
		open={!!target}
		onOpenChange={(o) => {
			if (!o) onclose();
		}}
	>
		<Dialog.Content
			showCloseButton={false}
			class="top-auto bottom-0 left-0 flex h-[88dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom"
		>
			<Dialog.Title class="sr-only">{target?.title ?? 'Peek'}</Dialog.Title>
			<div class="relative flex h-12 shrink-0 items-center gap-1 border-b px-2">
				<span class="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30"></span>
				<div class="absolute right-2 flex items-center">
					{#if target}
						<Button
							variant="ghost"
							size="icon"
							href={target.url}
							onclick={() => target && noteOpened(target.url)}
							target="_blank"
							rel="noreferrer"
							aria-label="Open on GitHub"><ExternalLink /></Button
						>
					{/if}
					<Button variant="ghost" size="icon" aria-label="Close peek" onclick={onclose}
						><X /></Button
					>
				</div>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				{#if target}{@render content(target)}{/if}
			</div>
			{#if footer && target}
				<div class="flex shrink-0 flex-wrap items-center gap-1 border-t p-2">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
