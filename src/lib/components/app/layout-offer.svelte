<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { createQuery } from '@tanstack/svelte-query';
	import { meQuery } from '$lib/queries';
	import { toast } from 'svelte-sonner';
	import { applySettings, saveSettings } from '$lib/save-settings';
	import { dismissNote, dismissedNotes } from '$lib/dismissed-notes.svelte';
	import { ui } from '$lib/ui.svelte';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';

	const TABLE_LAYOUT_OFFER = 'table-layout-offer';
	const APPEAR_DELAY_MS = 800;
	const PREVIEW_LINES = [0.9, 0.65, 0.8, 0.5];
	const UNDO_TOAST_MS = 10_000;

	const me = createQuery(meQuery);
	const offered = $derived(
		me.data?.settings.rowLayout === 'cards' &&
			!dismissedNotes.keys.includes(TABLE_LAYOUT_OFFER) &&
			!ui.bulkBarOpen
	);

	async function useTable() {
		dismissNote(TABLE_LAYOUT_OFFER);
		try {
			await applySettings({ rowLayout: 'table' });
		} catch (err) {
			toast.error((err as Error).message);
			return;
		}
		toast.success('Table layout on', {
			description: 'Change it at any time in Settings → General.',
			duration: UNDO_TOAST_MS,
			action: {
				label: 'Undo',
				onClick: () => void saveSettings({ rowLayout: 'cards' }, 'Back to cards')
			}
		});
	}
</script>

{#if offered}
	<div
		role="dialog"
		aria-labelledby="layout-offer-title"
		class="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 rounded-xl border bg-popover p-3 text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
		in:fly={{ y: 16, duration: 240, delay: APPEAR_DELAY_MS, easing: cubicOut }}
		out:fly={{ y: 16, duration: 160, easing: cubicOut }}
	>
		<div class="flex gap-3">
			<div
				class="flex w-16 shrink-0 flex-col justify-center gap-1.5 rounded-md border bg-background px-1.5 py-2"
				aria-hidden="true"
			>
				{#each PREVIEW_LINES as width, index (index)}
					<span class="flex items-center gap-1">
						<span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"></span>
						<span class="h-1 rounded-full bg-muted-foreground/30" style:width="{width * 100}%"
						></span>
					</span>
				{/each}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-start justify-between gap-2">
					<p id="layout-offer-title" class="font-medium">Want a denser list?</p>
					<Button
						variant="ghost"
						size="icon-xs"
						class="-mt-1 -mr-1"
						aria-label="Not now"
						onclick={() => dismissNote(TABLE_LAYOUT_OFFER)}><X /></Button
					>
				</div>
				<p class="mt-0.5 text-xs text-muted-foreground">
					The table layout shows each item on one line, in columns that you choose.
				</p>
				<div class="mt-2.5 flex gap-1.5">
					<Button size="xs" onclick={useTable}>Use the table</Button>
					<Button variant="ghost" size="xs" onclick={() => dismissNote(TABLE_LAYOUT_OFFER)}
						>Not now</Button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
