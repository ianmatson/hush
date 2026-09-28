<script lang="ts">
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { api, type ActionBody, type ItemAction } from '$lib/api';
	import { keys, queryClient } from '$lib/queries';
	import type { ItemDTO } from '$lib/shared/types';
	import { alreadyTrue, subjectKind } from '$lib/shared/snooze';
	import ItemWhy from '$lib/components/app/item-why.svelte';
	import PeekContent from '$lib/components/app/peek-content.svelte';
	import GhActions from '$lib/components/app/gh-actions.svelte';
	import NotMineDialog from '$lib/components/app/not-mine-dialog.svelte';
	import SnoozeItems from '$lib/components/app/snooze-items.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Check from '@lucide/svelte/icons/check';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Undo from '@lucide/svelte/icons/undo-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	/** One item on its own page: /item/owner/repo/123, or /item/t/<thread id>. */
	const key = $derived.by(() => {
		const parts = page.params.key?.split('/') ?? [];
		return parts[0] === 't' ? `t:${parts[1]}` : `${parts[0]}/${parts[1]}#${parts[2]}`;
	});
	const item = createQuery(() => ({ queryKey: keys.item(key), queryFn: () => api.item(key) }));
	const t = $derived(item.data as ItemDTO | undefined);
	let notMine = $state<ItemDTO | null>(null);

	// Seeing its page counts as seeing it.
	$effect(() => {
		if (t?.unseen) act('seen');
	});

	async function act(action: ItemAction, body?: ActionBody) {
		try {
			await api.act([key], action, body);
			await queryClient.invalidateQueries({ queryKey: keys.item(key) });
			queryClient.invalidateQueries({ queryKey: keys.itemsAll });
			if (action !== 'seen') toast.success(action === 'restore' ? 'Moved back' : 'Saved');
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
	const handled = $derived(
		!!t &&
			(t.state === 'done' ||
				t.state === 'muted' ||
				(t.state === 'snoozed' && (t.snoozedUntil ?? 0) > Date.now()))
	);
</script>

<svelte:head><title>{t ? `${t.title} · Hush` : 'Hush'}</title></svelte:head>

<main data-page class="mx-auto max-w-3xl px-4 pt-5 pb-24">
	{#if item.isError}
		<p class="py-16 text-center text-sm text-muted-foreground">
			Hush has no item {key}. It may be older than Hush keeps, or not involve you.
		</p>
	{:else if t}
		<div class="mb-3 flex items-center gap-2">
			<a
				href={t.url}
				target="_blank"
				rel="noreferrer"
				class="min-w-0 truncate font-mono text-xs text-muted-foreground hover:text-foreground"
				>{t.number ? `${t.repo}#${t.number}` : t.repo}</a
			>
			<Button
				variant="ghost"
				size="icon-sm"
				href={t.url}
				target="_blank"
				rel="noreferrer"
				aria-label="Open on GitHub"><ExternalLink /></Button
			>
		</div>
		<div class="overflow-hidden rounded-xl border">
			<ItemWhy item={t} onnotmine={() => (notMine = t)} onmyturn={() => act('my-turn')} />
			<div class="flex flex-wrap items-center gap-1 border-b px-3 py-2">
				{#if handled}
					<Button variant="ghost" size="sm" onclick={() => act('restore')}
						><Undo />{t.state === 'muted' ? 'Unmute' : 'Move back'}</Button
					>
				{:else}
					<Button variant="ghost" size="sm" onclick={() => act('done')}><Check />Done</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="sm"><AlarmClock />Snooze</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-56">
							<SnoozeItems
								subjects={[subjectKind(t.subjectType)]}
								disabled={alreadyTrue({ ci: t.ci, state: t.prState })}
								onpick={(b) => act('snooze', b)}
							/>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button variant="ghost" size="sm" onclick={() => act('mute')}><BellOff />Mute</Button>
				{/if}
				{#if t.number}
					<div class="ml-auto"><GhActions repo={t.repo} number={t.number} need={t.needs} /></div>
				{/if}
			</div>
			<PeekContent repo={t.repo} number={t.number} title={t.title} />
		</div>
	{/if}
</main>

<NotMineDialog bind:item={notMine} />
