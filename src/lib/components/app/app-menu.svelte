<script lang="ts">
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { MenuEntry } from '$lib/menu';
	import SnoozeItems from './snooze-items.svelte';

	/**
	 * The items of a right-click menu (`context`) or a "⋯" menu (`dropdown`), from one list, so
	 * both show the same choices in the same order. Put this inside a menu's Content.
	 */
	let { entries, kind }: { entries: MenuEntry[]; kind: 'context' | 'dropdown' } = $props();
	const M = $derived(kind === 'context' ? ContextMenu : DropdownMenu);
</script>

{#snippet list(items: MenuEntry[])}
	{#each items as e (e.key)}
		{#if e.type === 'sep'}
			<M.Separator />
		{:else if e.type === 'item'}
			<M.Item disabled={e.disabled} onclick={e.run}>
				{#if e.icon}<e.icon />{/if}{e.label}
				{#if e.shortcut && kind === 'context'}<M.Shortcut>{e.shortcut}</M.Shortcut>{/if}
			</M.Item>
		{:else if e.type === 'sub'}
			<M.Sub>
				<M.SubTrigger
					>{#if e.icon}<e.icon />{/if}{e.label}</M.SubTrigger
				>
				<M.SubContent class="w-56">{@render list(e.items)}</M.SubContent>
			</M.Sub>
		{:else if kind === 'dropdown'}
			<!-- Phones: nested submenus do not fit, so Snooze opens a sheet. -->
			<M.Item onclick={e.sheet}
				>{#if e.icon}<e.icon />{/if}{e.label}…</M.Item
			>
		{:else}
			<M.Sub>
				<M.SubTrigger
					>{#if e.icon}<e.icon />{/if}{e.label}</M.SubTrigger
				>
				<M.SubContent class="w-56">
					<SnoozeItems menu={kind} subjects={e.subjects} disabled={e.disabled} onpick={e.onpick} />
				</M.SubContent>
			</M.Sub>
		{/if}
	{/each}
{/snippet}

{@render list(entries)}
