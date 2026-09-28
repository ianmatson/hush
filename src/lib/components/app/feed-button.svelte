<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, queryClient } from '$lib/queries';
	import type { FeedDTO } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Rss from '@lucide/svelte/icons/rss';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';

	/**
	 * The Atom feed of one lane or saved search: make it (and copy its secret URL), get a new address, or turn
	 * it off. Hush keeps only a hash of the address, so it can show the URL only when it makes it.
	 */
	let { view, name, feeds }: { view: string; name: string; feeds: FeedDTO[] | undefined } =
		$props();
	const feed = $derived(feeds?.find((f) => f.view === view));

	/** A new address for the tab (the old one, if any, stops working). */
	async function make(renew: boolean) {
		try {
			const f = await api.feedOn(view);
			queryClient.setQueryData<FeedDTO[]>(keys.feeds, (old) => [
				...(old ?? []).filter((x) => x.view !== view),
				{ view: f.view, createdAt: f.createdAt }
			]);
			const url = f.url!;
			const copied = await navigator.clipboard.writeText(url).then(
				() => true,
				() => false
			);
			toast.success(
				`${renew ? 'New feed URL' : 'Feed URL'} for “${name}” ${copied ? 'copied' : 'made'}`,
				{
					description: `${url}\nHush shows it only this once. Keep it secret: anyone with it can read the feed.${renew ? ' The old URL no longer works.' : ''}`,
					duration: 30_000,
					action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(url) }
				}
			);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}
	async function off() {
		await api.feedOff(view);
		queryClient.setQueryData<FeedDTO[]>(keys.feeds, (old) => old?.filter((x) => x.view !== view));
		toast.success(`Feed for “${name}” turned off. Its URL no longer works.`);
	}
</script>

{#if feed}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label="Feed of {name}"
					title="Feed on"><Rss class="text-orange-500" /></Button
				>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Item onclick={() => make(true)}><RefreshCw />New feed URL</DropdownMenu.Item>
			<DropdownMenu.Item variant="destructive" onclick={off}><X />Turn off feed</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label="Make a feed of {name}"
		title="Make a feed"
		class={cn(!feeds && 'invisible')}
		onclick={() => make(false)}><Rss class="opacity-50" /></Button
	>
{/if}
