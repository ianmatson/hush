<script lang="ts">
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { LINK_PEEK_OWNER, claimPeek, closePeek, peek } from '$lib/peek.svelte';
	import { PEEK_PARAM, parsePeekLink, peekLinkParam, peekLinkUrl } from '$lib/shared/peek-link';
	import Peek from './peek.svelte';

	const ENCODED_SLASH = /%2F/gi;

	let lastSeenParam: string | null = null;

	function openLink(param: string): boolean {
		const link = parsePeekLink(param);
		const target = peek.target;
		if (!link || (target?.repo === link.repo && target.number === link.number)) return false;
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
		return true;
	}

	function writeParam(value: string | null) {
		const url = new URL(page.url);
		if (value === null) url.searchParams.delete(PEEK_PARAM);
		else url.searchParams.set(PEEK_PARAM, value);
		const href = url.pathname + url.search.replace(ENCODED_SLASH, '/') + url.hash;
		replaceState(href, page.state);
	}

	$effect(() => {
		const param = page.url.searchParams.get(PEEK_PARAM);
		const target = peek.target;
		const shown = target?.number
			? peekLinkParam({ repo: target.repo, number: target.number })
			: null;
		const linkChanged = param !== null && param !== lastSeenParam;
		lastSeenParam = param;
		if (param === shown) return;
		untrack(() => {
			if (linkChanged && openLink(param)) return;
			writeParam(shown);
		});
	});
</script>

<Peek
	target={peek.target}
	onclose={closePeek}
	header={peek.header ?? undefined}
	footer={peek.footer ?? undefined}
/>
