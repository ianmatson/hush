<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { createQuery } from '@tanstack/svelte-query';
	import { api } from '$lib/api';
	import { feedsQuery, keys, queryClient } from '$lib/queries';
	import type { FeedDTO, FeedFilter } from '$lib/shared/types';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash from '@lucide/svelte/icons/trash';
	import Plus from '@lucide/svelte/icons/plus';

	const feeds = createQuery(feedsQuery);
	let name = $state('');
	let view = $state<FeedFilter['view']>('action');
	let repo = $state('');
	const views = { action: 'Needs you', fyi: 'FYI', all: 'Everything' } as const;

	async function create(e: SubmitEvent) {
		e.preventDefault();
		try {
			const feed = await api.createFeed(name, { view, repo: repo || undefined });
			queryClient.setQueryData<FeedDTO[]>(keys.feeds, (old) => [...(old ?? []), feed]);
			name = '';
			repo = '';
			await navigator.clipboard?.writeText(feed.url).catch(() => {});
			toast.success('Feed created. The URL is on your clipboard.');
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function remove(id: string) {
		await api.deleteFeed(id);
		queryClient.setQueryData<FeedDTO[]>(keys.feeds, (old) => old?.filter((f) => f.id !== id));
	}

	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		toast.success('Copied');
	}
</script>

<svelte:head><title>Feeds · Settings · Hush</title></svelte:head>

<div class="grid gap-6">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Feeds</h1>
		<p class="text-sm text-muted-foreground">
			Atom feeds of a filtered inbox stream, for any feed reader. The URL is secret: anyone with it
			can read the feed.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="grid gap-4">
			{#if feeds.data?.length}
				<ul class="grid gap-1 rounded-lg border p-1 text-sm">
					{#each feeds.data as f (f.id)}
						<li class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
							<span class="font-medium">{f.name}</span>
							<span class="text-xs text-muted-foreground"
								>{views[f.filter.view]}{f.filter.repo ? ` · ${f.filter.repo}` : ''}</span
							>
							<span class="ml-auto flex gap-1">
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label="Copy feed URL"
									onclick={() => copy(f.url)}><Copy /></Button
								>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label="Delete feed"
									onclick={() => remove(f.id)}><Trash /></Button
								>
							</span>
						</li>
					{/each}
				</ul>
			{:else if feeds.isSuccess}
				<p class="text-sm text-muted-foreground">No feeds yet.</p>
			{/if}
			<form class="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end" onsubmit={create}>
				<div class="grid gap-1.5">
					<Label for="feed-name">Name</Label>
					<Input id="feed-name" placeholder="Reviews for me" bind:value={name} required />
				</div>
				<div class="grid gap-1.5">
					<Label>Stream</Label>
					<Select.Root type="single" bind:value={view}>
						<Select.Trigger class="w-36">{views[view]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(views) as [value, label] (value)}
								<Select.Item {value} {label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="grid gap-1.5">
					<Label for="feed-repo">Repos (optional glob)</Label>
					<Input id="feed-repo" placeholder="PostHog/*" bind:value={repo} />
				</div>
				<Button type="submit" disabled={!name.trim()}><Plus /> Create</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
