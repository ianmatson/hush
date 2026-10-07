<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { claimPeek, closePeek, peek } from '$lib/peek.svelte';
	import { PEEK_PARAM, parsePeekLink, peekLinkUrl } from '$lib/shared/peek-link';
	import Peek from './peek.svelte';

	const LINK_PEEK_OWNER = 'link';

	$effect(() => {
		const url = page.url;
		if (!url.searchParams.has(PEEK_PARAM)) return;
		const link = parsePeekLink(url.searchParams.get(PEEK_PARAM));
		url.searchParams.delete(PEEK_PARAM);
		goto(url.pathname + url.search + url.hash, { replaceState: true, noScroll: true });
		if (!link) return;
		untrack(() => {
			claimPeek(LINK_PEEK_OWNER);
			peek.header = null;
			peek.footer = null;
			peek.target = {
				id: `${LINK_PEEK_OWNER}:${link.repo}#${link.number}`,
				repo: link.repo,
				number: link.number,
				title: `${link.repo}#${link.number}`,
				url: peekLinkUrl(link),
				need: null
			};
		});
	});
</script>

<Peek
	target={peek.target}
	onclose={closePeek}
	header={peek.header ?? undefined}
	footer={peek.footer ?? undefined}
/>
