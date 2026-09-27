<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { keys, queryClient } from '$lib/queries';
	import type { FeedDTO } from '$lib/shared/types';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Rss from '@lucide/svelte/icons/rss';
	import Copy from '@lucide/svelte/icons/copy';
	import X from '@lucide/svelte/icons/x';

	/** The Atom feed of one inbox tab: turn it on (and copy its secret URL), copy, or turn off. */
	let { view, name, feeds }: { view: string; name: string; feeds: FeedDTO[] | undefined } =
		$props();
	const feed = $derived(feeds?.find((f) => f.view === view));

	async function copy(url: string) {
		await navigator.clipboard.writeText(url).catch(() => {});
		toast.success(`Feed URL for “${name}” copied. Keep it secret: anyone with it can read it.`);
	}
	async function on() {
		try {
			const f = await api.feedOn(view);
			queryClient.setQueryData<FeedDTO[]>(keys.feeds, (old) => [
				...(old ?? []).filter((x) => x.view !== view),
				f
			]);
			await copy(f.url);
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
			<DropdownMenu.Item onclick={() => copy(feed.url)}><Copy />Copy feed URL</DropdownMenu.Item>
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
		onclick={on}><Rss class="opacity-50" /></Button
	>
{/if}
