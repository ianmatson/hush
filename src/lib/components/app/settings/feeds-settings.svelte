<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { feedsQuery, meQuery } from '$lib/queries';
	import { FEED_LANES } from '$lib/shared/search';
	import * as Card from '$lib/components/ui/card';
	import FeedButton from '$lib/components/app/feed-button.svelte';

	/** Atom feeds of the lanes and of saved searches. */
	const me = createQuery(meQuery);
	const feeds = createQuery(feedsQuery);
	const tabs = $derived([
		...FEED_LANES,
		...(me.data?.settings.saved ?? []).map((v) => ({ id: `s:${v.id}`, label: v.name }))
	]);
</script>

<Card.Root id="feeds" class="scroll-mt-20">
	<Card.Header>
		<Card.Title>Feeds</Card.Title>
		<Card.Description
			>A lane or a saved search as an Atom feed, for a feed reader or a script. The address is
			secret: Hush shows it once, when it makes it.</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<ul class="divide-y rounded-md border" aria-label="Feeds">
			{#each tabs as t (t.id)}
				<li class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
					<span>{t.label}</span>
					<FeedButton view={t.id} name={t.label} feeds={feeds.data} />
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
